import { PGlite } from '@electric-sql/pglite';
import Type from '@expressive/orm';

export * from '@expressive/orm';

let db =  new PGlite();

export class Table extends Type {
  static connection = {
    get,
    remove,
    insert,
    update,
    query,
    reset(){
      db = new PGlite();
    },
    exec(qs: string) {
      return db?.exec(qs);
    },
    init(schema: string) {
      db = new PGlite();
      return db.exec(schema);
    }
  };
}

async function get(
  table: string,
  constraints: [field: string, op: string, value?: any][],
  limit?: number,
  offset: number = 0
): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  const order: string[] = [];

  constraints.forEach(([field, op, value]) => {
    if (op === 'asc' || op === 'desc') {
      order.push(`"${field}" ${op.toUpperCase()}`);
      return;
    }

    // TODO: Fix this on the ORM side.
    if (op == 'IS NOT NULL') {
      conditions.push(`"${field}" IS NOT NULL`);
      return;
    }

    const index = params.push(value);
    const variable = Array.isArray(value) ? `ANY($${index})` : `$${index}`;

    conditions.push(`"${field}" ${op} ${variable}`);
  });

  let qs = `SELECT * FROM ${escape(table)}`;

  if (conditions.length) {
    qs += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (order.length) {
    qs += ` ORDER BY ${order.join(', ')}`;
  }
  if (limit) {
    qs += ` LIMIT ${limit}`;
  }
  if (offset) {
    qs += ` OFFSET ${offset}`;
  }

  return query(qs, params);
}

async function insert(
  table: string,
  data: Record<string, any>,
  returns?: boolean
): Promise<any> {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  let qs = `INSERT INTO ${escape(table)} (${keys.map(escape).join(', ')}) VALUES (${placeholders})`;

  if (returns) qs += ` RETURNING *`;

  const result = await query(qs, values);

  return returns ? result[0] : undefined;
}

async function update(
  table: string,
  id: string | number,
  data: Record<string, any>
) {
  const keys = Object.keys(data);
  const values = Object.values(data);

  const setClause = keys
    .map((key, i) => `${escape(key)} = $${i + 1}`)
    .join(', ');

  const qs = `UPDATE ${escape(table)} SET ${setClause} WHERE id = $${keys.length + 1}`;

  await query(qs, [...values, id]);
}

async function remove(table: string, id: string | number) {
  await query(`DELETE FROM ${escape(table)} WHERE id = $1`, [id]);
}

async function query<T = any>(
  queryText: string,
  params?: (string | number | string[] | Date)[]
): Promise<T[]> {
  
  if (!db) db = new PGlite();

  try {
    const paramValues = params?.map((x) => {
      if (x instanceof Date) return x.toISOString();
      return x;
    });

    const result = await db.query(queryText, paramValues);
    return result.rows as T[];
  } catch (error) {
    console.error(`Query failed: ${queryText}`);
    console.error(error);
    throw error;
  }
}

function escape(name: string): string {
  return name
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}
