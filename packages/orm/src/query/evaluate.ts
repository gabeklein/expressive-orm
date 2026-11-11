import { Field } from '../Field';
import type { Type } from '../Type';
import type { Builder } from './Builder';
import { Computed } from './Computed';
import type { Query } from './Query';
import { Cond, DataField, DataTable, Expression, now, Parameter, Value } from './Value';

declare namespace evaluate {
  /** A stored row, by column. */
  type Row = Record<string, any>;

  /** A query table backed by an entity class. */
  type Table = Builder.ITable & { type: Query.Table };

  /** What `evaluate` needs from a store. */
  interface Store {
    /** Rows of a table. `where` lists conditions the store may apply early; `evaluate` filters again. */
    rows(table: Table, where: Type.Constraint[]): Row[] | Promise<Row[]>;
    /** Insert a row, resolving it as stored. */
    insert(table: Table, row: Row): Row | Promise<Row>;
    /** Assign columns on a row `rows` returned. */
    update(table: Table, row: Row, assign: Row): void | Promise<void>;
    /** Delete rows `rows` returned. */
    delete(table: Table, rows: Row[]): void | Promise<void>;
  }
}

type Row = evaluate.Row;
type Scope = Map<Builder.ITable, Row | undefined>;

const MATCH: Record<string, (field: any, value: any) => boolean> = {
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<>': (a, b) => a !== b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  'LIKE': (a, b) => like(b).test(a),
  'IN': (a, b) => b.includes(a),
  'NOT IN': (a, b) => !b.includes(a)
};

const NULL: Record<string, (field: any) => boolean> = {
  'IS NULL': (a) => a == null,
  'IS NOT NULL': (a) => a != null
};

const MATH: Record<string, (left: any, right: any) => unknown> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b
};

const UNARY: Record<string, (value: any) => unknown> = {
  '-': (a) => -a,
  '+': (a) => +a,
  '~': (a) => ~a
};

function like(pattern: string) {
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');

  return new RegExp(`^${source}$`, 's');
}

function plain(value: unknown) {
  return value instanceof Date ? value.getTime() : value;
}

function text(value: unknown) {
  return typeof value == "string" ? value : value instanceof Date ? value.toISOString() : JSON.stringify(value);
}

function match(op: string, left: unknown, right: unknown) {
  const test = MATCH[op];

  if (!test)
    throw new Error(`Unsupported operator: ${op}`);

  if (left == null)
    return false;

  if (op.includes("LIKE"))
    return test(text(left), right);

  return test(plain(left), Array.isArray(right) ? right.map(plain) : plain(right));
}

function sort<T>(items: T[], keys: [(item: T) => unknown, number][]) {
  return [...items].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = plain(key(a)) ?? null;
      const y = plain(key(b)) ?? null;

      if (x !== y)
        return (y === null || x !== null && x > y ? 1 : -1) * dir;
    }

    return 0;
  });
}

/**
 * Run a `Query` builder in JS against a store - for a driver without a query language.
 *
 * Joins, filters, orders and limits in memory, then applies writes through the store.
 * Resolves `{ rows, count }` - `rows` when the query selects. Throws for raw SQL templates.
 */
async function evaluate(store: evaluate.Store, query: Builder, params: unknown[]) {
  const { tables, inserts, updates, deletes, filters, order, limit, offset = 0, returns } = query;

  if (query.templates.size)
    throw new Error("Query templates are not supported by this connection.");

  function value(input: unknown, scope: Scope, field?: Field): unknown {
    if (input === now)
      return field!.set(new Date());

    if (input instanceof Field || input instanceof DataField)
      return scope.get(input.table!)?.[input.column];

    if (input instanceof Computed) {
      const { operator } = input;
      const right = value(input.right, scope);

      if (input.left === undefined)
        return right == null ? null : UNARY[operator](right);

      const left = value(input.left, scope);

      return left == null || right == null ? null : MATH[operator](left, right);
    }

    if (input instanceof Parameter)
      return params[query.params.indexOf(input)];

    return input;
  }

  function encode({ left, op }: Cond, input: unknown, scope: Scope) {
    return input instanceof Value || input instanceof Field || input == null
      ? value(input, scope, left)
      : op.includes("LIKE") ? input : left.set(input);
  }

  function test(cond: Cond, scope: Scope): boolean {
    const { left, op, right } = cond;
    const field = value(left, scope);
    const against = Array.isArray(right) ? right.map(input => encode(cond, input, scope)) : encode(cond, right, scope);

    if (against == null)
      return op === '=' ? field == null : op === '<>' && field != null;

    return match(op, field, against);
  }

  function check(item: Expression, scope: Scope, or: boolean): boolean {
    if (item instanceof Cond)
      return test(item, scope);

    const children = Array.from(item.children);

    return or
      ? children.some(child => check(child, scope, !or))
      : children.every(child => check(child, scope, !or));
  }

  function where(table: Builder.ITable){
    const out: Type.Constraint[] = [];

    if (table.optional)
      return out;

    for (const cond of filters.children) {
      if (!(cond instanceof Cond) || cond.left.table !== table)
        continue;

      const { left, op, right } = cond;
      const values = Array.isArray(right) ? right : [right];

      if (values.some(input => input === now || input instanceof Field || input instanceof Value && !(input instanceof Parameter)))
        continue;

      const scope: Scope = new Map();
      const against = Array.isArray(right) ? right.map(input => encode(cond, input, scope)) : encode(cond, right, scope);

      if (against != null)
        out.push([left.column, op, against]);
      else if (op === '=' || op === '<>')
        out.push([left.column, op === '=' ? 'IS NULL' : 'IS NOT NULL']);
    }

    return out;
  }

  const joins = new Set<Cond>();
  const bound = new Set<Builder.ITable>();
  let scopes: Scope[] = [new Map()];

  tables.forEach(table => table.joins.forEach(cond => joins.add(cond)));

  for (const source of tables.values()) {
    if (inserts.has(source))
      continue;

    bound.add(source);

    const ready = Array.from(joins).filter(({ left, right }) => (
      bound.has(left.table!) && bound.has((right as Field | DataField).table!)
    ));

    const rows = source instanceof DataTable ? source.output : await store.rows(source as evaluate.Table, where(source));
    const next: Scope[] = [];

    ready.forEach(cond => joins.delete(cond));

    for (const scope of scopes) {
      const matched = rows
        .map(row => new Map(scope).set(source, row))
        .filter(scope => ready.every(cond => test(cond, scope)));

      if (!matched.length && source.optional)
        matched.push(new Map(scope).set(source, undefined));

      next.push(...matched);
    }

    scopes = next;
  }

  scopes = scopes.filter(scope => check(filters, scope, false));
  scopes = sort(scopes, Array.from(order, ([field, dir]) => [
    (scope: Scope) => value(field, scope),
    dir === 'asc' ? 1 : -1
  ]));

  scopes = scopes.slice(offset, limit ? offset + limit : undefined);

  let count = scopes.length;

  for (const [target, data] of inserts)
    for (const scope of scopes) {
      const row: Row = {};

      data.forEach((input, field) => {
        row[field.column] = value(input, scope, field);
      });

      scope.set(target, await store.insert(target as evaluate.Table, row));
    }

  for (const [target, data] of updates) {
    const changed = new Map<Row, Row>();

    for (const scope of scopes) {
      const assign: Row = {};

      data.forEach((input, field) => {
        assign[field.column] = value(input, scope, field);
      });

      changed.set(scope.get(target)!, assign);
    }

    for (const [row, assign] of changed)
      await store.update(target as evaluate.Table, row, assign);

    count = changed.size;
  }

  for (const target of deletes) {
    const removed = new Set(scopes.map(scope => scope.get(target)!));

    await store.delete(target as evaluate.Table, [...removed]);
    count = removed.size;
  }

  const rows = returns && scopes.map(scope => {
    if (!(returns instanceof Map))
      return { value: value(returns, scope) };

    const row: Row = {};

    returns.forEach((select, key) => {
      row[key] = value(select, scope);
    });

    return row;
  });

  return { rows, count };
}

export { evaluate, match, NULL, sort };
