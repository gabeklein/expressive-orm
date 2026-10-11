import { Field } from './Field';
import type { Builder } from './query/Builder';
import { Computed } from './query/Computed';
import { Cond, DataField, DataTable, Expression, Parameter, Value } from './query/Value';
import type { Type } from './Type';

type Row = Record<string, any>;
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

function memory(): Type.Connection {
  const tables = new Map<string, { rows: Row[], next: number }>();

  function table(name: string) {
    let table = tables.get(name);

    if (!table)
      tables.set(name, table = { rows: [], next: 1 });

    return table;
  }

  function add(name: string, data: Row) {
    const into = table(name);
    const row = { id: into.next, ...data };

    if (typeof row.id == "number")
      into.next = Math.max(into.next, row.id + 1);
    into.rows.push(row);

    return row;
  }

  async function get(name: string, constraints: Type.Constraint[], limit?: number, offset = 0) {
    const order: [(row: Row) => unknown, number][] = [];
    let rows = table(name).rows;

    for (const [field, op, value] of constraints) {
      if (op === 'asc' || op === 'desc') {
        order.push([row => row[field], op === 'asc' ? 1 : -1]);
        continue;
      }

      const test = NULL[op];

      rows = test
        ? rows.filter(row => test(row[field]))
        : rows.filter(row => match(op, row[field], value));
    }

    return sort(rows, order)
      .slice(offset, limit ? offset + limit : undefined)
      .map(row => ({ ...row }));
  }

  async function insert(name: string, data: Row, returns?: boolean) {
    const row = add(name, data);

    if (returns)
      return { ...row };
  }

  async function update(name: string, id: string | number, data: Row) {
    for (const row of table(name).rows)
      if (row.id === id)
        Object.assign(row, data);
  }

  async function remove(name: string, id: string | number) {
    const into = table(name);
    into.rows = into.rows.filter(row => row.id !== id);
  }

  function execute(query: Builder, params: unknown[]) {
    const { tables, inserts, updates, deletes, filters, order, limit, offset = 0, returns } = query;

    if (query.templates.size)
      throw new Error("Query templates are not supported by the memory driver.");

    function value(input: unknown, scope: Scope): unknown {
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
          ? value(input, scope)
          : left.set(input)
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

      const rows = source instanceof DataTable ? source.output : table(source.name).rows;
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

    inserts.forEach((data, target) => {
      for (const scope of scopes) {
        const row: Row = {};

        data.forEach((input, field) => {
          row[field.column] = value(input, scope);
        });

        scope.set(target, add(target.name, row));
      }
    });

    updates.forEach((data, target) => {
      const changed = new Set<Row>();

      for (const scope of scopes) {
        const row = scope.get(target)!;
        const assign: Row = {};

        data.forEach((input, field) => {
          assign[field.column] = value(input, scope);
        });

        Object.assign(row, assign);
        changed.add(row);
      }

      count = changed.size;
    });

    deletes.forEach(target => {
      const removed = new Set(scopes.map(scope => scope.get(target)));
      const store = table(target.name);

      store.rows = store.rows.filter(row => !removed.has(row));
      count = removed.size;
    });

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

  function prepare(query: Builder): Builder.Statement {
    return {
      all: async (params) => execute(query, params!).rows!,
      run: async (params) => execute(query, params!).count,
      toString: () => String(query)
    };
  }

  return { get, insert, update, remove, prepare };
}

export { memory };
