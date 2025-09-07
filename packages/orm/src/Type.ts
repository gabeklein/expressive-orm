import { Field, init, num, underscore } from './fields';
import { desc, equal, Where } from './where';

type Values<T extends Type> = {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class ? never : K
  )]: T[K];
}

type Compat<T extends Type> = Partial<Values<T>>;

type ClassKeys<T> = {
  [K in keyof T]: T[K] extends Type.Class ? K : T[K] extends (...args: any[]) => any ? K : never
}[keyof T];

type Fields<T extends Type> = Exclude<keyof T, keyof Type | ClassKeys<T>>;

type Insert<T extends Type> = {
  [K in Fields<T> as (undefined extends T[K] ? never : K)]: T[K];
} & {
  [K in Fields<T> as (undefined extends T[K] ? K : never)]?: T[K];
};

declare namespace Type {
  type Class<T extends Type = Type> = (abstract new (...args: any[]) => T) & typeof Type;

  type Instance<T> = T extends Class<infer U> ? U : T;

  type KeyOf<T> = T extends Class<infer U> ? keyof U : keyof T;

  type Result<T extends Type> = PromiseLike<T[]>;

  type Conds<T> = Where | T | Conds<T>[]

  type Query<T extends {}> = {
    [K in keyof T]?: Conds<T[K]>;
  };

  type Constraint = [
    field: string,
    op: string,
    value?: any
  ]

  interface Connection {
    get: (table: string, constraints: Constraint[], limit?: number, offset?: number) => Promise<any[]>;
    insert: (table: string, data: Record<string, any>, returns?: boolean) => Promise<any>;
    update: (table: string, id: string | number, data: Record<string, any>) => Promise<void>;
    remove: (table: string, id: string | number) => Promise<void>;
  }

  export {
    Class,
    Compat,
    Connection,
    Constraint,
    Insert,
    Instance,
    KeyOf,
    Query,
    Result,
    Values
  }
}

async function reject(): Promise<never> {
  throw new Error("No database connection. Please set Type.connection to a valid Connection instance.");
}

class NotReady {
  get = reject;
  insert = reject;
  update = reject;
  remove = reject;
}

abstract class Type {
  id = num({ optional: true });

  get values() {
    const values: Record<string, any> = {};
    const type = this.constructor as typeof Type;

    for (const [key] of type.fields)
      values[key] = (this as any)[key];

    return Object.freeze(values) as Values<this>;
  };

  protected async onDelete?(): Promise<void>;

  async update(data: Type.Compat<this>) {
    if (Object.keys(data).length === 0)
      return;

    const type = this.constructor as typeof Type
    const row = await type.prepare(data, true);
    await type.connection.update(type.ref, this.id, row);

    for (const [key] of type.fields)
      if (key in data)
        Object.defineProperty(this, key, {
          value: (data as any)[key],
          configurable: true,
          enumerable: true,
          writable: false,
        });
  }

  async delete() {
    const { connection, ref } = this.constructor as typeof Type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(ref, this.id);
  }

  static schema?: string;
  static subset?: Record<string, unknown>;
  static connection: Type.Connection = new NotReady();
  static table = underscore(this.name)

  static get ref() {
    const { schema, table } = this;
    const ref = schema ? `${schema}.${table}` : table;
    Object.defineProperty(this, 'ref', { value: ref });
    return ref;
  }

  static get fields(): Map<string, Field> {
    const fields = init(this);
    Object.defineProperty(this, 'fields', { value: fields });
    return fields;
  }

  protected static async from<T extends Type>(
    this: Type.Class<T>,
    raw: Record<string, any>
  ){
    const entity = Object.create(this.prototype) as T;

    for (const field of this.fields.values())
      await field.parse(entity, raw);

    return entity;
  }

  protected static async prepare<T extends Type>(
    this: Type.Class<T>,
    data: Compat<T>,
    partial?: boolean
  ){
    const row: Record<string, any> = {};

    for (const field of this.fields.values())
      await field.apply(row, data, partial);

    return row;
  }

  static async set<T extends Type>(this: Type.Class<T>, id: T["id"], data: Type.Compat<T>) {
    await this.connection.update(this.ref, id, this.prepare(data, true));
  }

  static async new<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, returns?: boolean): Promise<void>;
  static async new<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, returns: true): Promise<T>;
  static async new<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, returns?: boolean){
    const row = await this.prepare({ ...data as any, ...this.subset });
    const inserted = await this.connection.insert(this.ref, row, returns);

    if(inserted)
      return await this.from(inserted) as T;
  }

  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where: Type.Query<T>, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, id: T["id"], expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, id: T["id"], expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: number | Type.Query<T>, expect?: boolean): Promise<T | undefined> {
    if (typeof where === "number")
      where = { id: equal(where) };

    const [row] = await this.query(where, 1);

    if (!row && expect !== false)
      throw new Error(`No ${this.name} found with: \n${JSON.stringify(where, null, 2)}\n`);

    return row;
  }

  static async query<T extends Type>(
    from?: Type.Constraint[] | Type.Query<T>,
    limit?: number,
    offset: number = 0
  ): Promise<T[]> {
    const { connection, subset, ref } = this;

    if (!from)
      from = { id: desc() };

    if (!Array.isArray(from))
      from = buildConstraints({ ...from, ...subset });

    from = from.map(([key, op, value]) => {
      const field = this.fields.get(key);

      if(field)
        return [field.column, op, field.set(value)]
    }).filter(Boolean) as Type.Constraint[];

    const rows = await connection.get(ref, from, limit, offset);
    return Promise.all(rows.map(row => this.from(row) as Promise<T>));
  }

  static async get<T extends Type>(
    this: Type.Class<T>,
    where?: Type.Query<T>,
    limit?: number,
    offset?: number
  ) {
    return this.query(where, limit, offset);
  }

  static async *all<T extends Type>(
    this: Type.Class<T>,
    pageSize: number,
    where?: Type.Query<T>
  ): AsyncGenerator<T[]> {
    let offset = 0;
    let done = false;

    while (!done) {
      const batch = await this.query(where, pageSize, offset);

      offset += batch.length;

      if (!batch.length) break;
      if (pageSize && batch.length < pageSize) done = true;

      yield batch;
    }
  }
}

function buildConstraints(where: Type.Query<any>) {
  const constraints: Type.Constraint[] = [];

  for (const key in where) {
    let field = where[key] as Where | Where[];

    if (!Array.isArray(field))
      field = [field];

    for (const val of field) {
      if (val === undefined || val instanceof Where && val.skip)
        continue;

      constraints.push(
        val instanceof Where
          ? [key, val.op || "=", val.value]
          : [key, '=', val]
      )
    }
  }

  return constraints;
}

export {
  Type,
  Type as default,
  Values,
  Compat,
  Insert,
};