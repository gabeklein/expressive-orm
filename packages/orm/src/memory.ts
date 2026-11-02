import type { Type } from './Type';

type Row = Record<string, any>;

const MATCH: Record<string, (field: any, value: any) => boolean> = {
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
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

function like(pattern: string) {
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');

  return new RegExp(`^${source}$`, 's');
}

function memory(): Type.Connection {
  const tables = new Map<string, { rows: Row[], next: number }>();

  function table(name: string) {
    let table = tables.get(name);

    if (!table)
      tables.set(name, table = { rows: [], next: 1 });

    return table;
  }

  async function get(name: string, constraints: Type.Constraint[], limit?: number, offset = 0) {
    const order: [string, number][] = [];
    let rows = table(name).rows;

    for (const [field, op, value] of constraints) {
      if (op === 'asc' || op === 'desc') {
        order.push([field, op === 'asc' ? 1 : -1]);
        continue;
      }

      const test = NULL[op];
      const match = MATCH[op];

      if (test)
        rows = rows.filter(row => test(row[field]));
      else if (match)
        rows = rows.filter(row => row[field] != null && match(row[field], value));
      else
        throw new Error(`Unsupported operator: ${op}`);
    }

    rows = [...rows].sort((a, b) => {
      for (const [field, dir] of order) {
        const x = a[field] ?? null;
        const y = b[field] ?? null;

        if (x !== y)
          return (y === null || x !== null && x > y ? 1 : -1) * dir;
      }

      return 0;
    });

    return rows
      .slice(offset, limit ? offset + limit : undefined)
      .map(row => ({ ...row }));
  }

  async function insert(name: string, data: Row, returns?: boolean) {
    const into = table(name);
    const row = { id: into.next, ...data };

    into.next = Math.max(into.next, row.id + 1);
    into.rows.push(row);

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

  return { get, insert, update, remove };
}

export { memory };
