import { Field } from '../Field';
import type { Builder } from './Builder';
import { Computed } from './Computed';
import { Cond, DataField, DataTable, Expression, now, Parameter, Value } from './Value';

declare namespace evaluate {
  type Row = Record<string, any>;

  type Result = {
    rows?: Row[];
    count: number;
  };

  interface Store {
    rows(table: Builder.ITable): Row[] | Promise<Row[]>;
    insert(table: Builder.ITable, row: Row): Row | Promise<Row>;
    update(table: Builder.ITable, row: Row, assign: Row): void | Promise<void>;
    delete(table: Builder.ITable, rows: Row[]): void | Promise<void>;
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

function match(op: string, left: unknown, right: unknown) {
  const test = MATCH[op];

  if (!test)
    throw new Error(`Unsupported operator: ${op}`);

  return left != null && test(left, right);
}

function sort<T>(items: T[], keys: [(item: T) => unknown, number][]) {
  return [...items].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = key(a) ?? null;
      const y = key(b) ?? null;

      if (x !== y)
        return (y === null || x !== null && x > y ? 1 : -1) * dir;
    }

    return 0;
  });
}

async function evaluate(store: evaluate.Store, query: Builder, params: unknown[]): Promise<evaluate.Result> {
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

  function test({ left, op, right }: Cond, scope: Scope): boolean {
    const encode = (input: unknown) => (
      input instanceof Value || input instanceof Field || input == null
        ? value(input, scope, left)
        : op.includes("LIKE") ? input : left.set(input)
    );

    const field = value(left, scope);
    const against = Array.isArray(right) ? right.map(encode) : encode(right);

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

    const rows = source instanceof DataTable ? source.output : await store.rows(source);
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

      scope.set(target, await store.insert(target, row));
    }

  for (const [target, data] of updates) {
    const changed = new Set<Row>();

    for (const scope of scopes) {
      const row = scope.get(target)!;
      const assign: Row = {};

      data.forEach((input, field) => {
        assign[field.column] = value(input, scope, field);
      });

      await store.update(target, row, assign);
      changed.add(row);
    }

    count = changed.size;
  }

  for (const target of deletes) {
    const removed = new Set(scopes.map(scope => scope.get(target)!));

    await store.delete(target, [...removed]);
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
