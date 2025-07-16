import { Field, init, num } from './fields';
import { desc, equal, Where } from './where';

type Values<T extends Type> = {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class ? never : K
  )]: T[K];
}

type Compat<T extends Type> = Partial<Values<T>>;

type Insert<T extends Type> = {
  [K in keyof Omit<T, keyof Type> as (
    undefined extends T[K] ? never : (T[K] extends Type.Class<any> ? never : K)
  )]: T[K];
} & {
  [K in keyof Omit<T, keyof Type> as (
    undefined extends T[K] ? (T[K] extends Type.Class<any> ? never : K) : never
  )]?: T[K];
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
  throw new Error("No database connection. Please set Entity.connection to a valid Connection instance.");
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
    await type.connection.update(type.table, this.id, type.write(data, true));

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
    const { connection, table } = this.constructor as typeof Type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(table, this.id);
  }

  static schema?: string;
  static subset?: Record<string, unknown>;
  static connection: Type.Connection = new NotReady();

  static get table() {
    const { name, schema } = this;
    return schema ? `${schema}.${name}` : name;
  }

  static get fields(): Map<string, Field> {
    const fields = init(this);
    Object.defineProperty(this, 'fields', { value: fields });
    return fields;
  }

  protected static from<T extends Type>(
    this: Type.Class<T>,
    raw: Record<string, any>
  ): T {
    const entity = Object.create(this.prototype) as T;

    for (const [key, { get }] of this.fields)
      Object.defineProperty(entity, key, {
        value: get ? get(raw[key]) : raw[key],
        configurable: true,
        enumerable: true
      });

    return entity;
  }

  protected static write<T extends Type>(
    this: Type.Class<T>,
    data: Compat<T>,
    partial?: boolean
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, { set, optional, nullable }] of this.fields) {
      const allowMissing = optional || nullable || partial;
      let value = key in data ? (data as any)[key] : undefined;

      if (value === undefined && allowMissing)
        continue;

      if (typeof set === "function")
        value = set(value);

      if (value === undefined)
        if (allowMissing)
          continue;
        else
          throw new Error(`Missing required field: ${key}`);
      else
        result[key] = value;
    }

    return result;
  }

  static async set<T extends Type>(this: Type.Class<T>, id: string, data: Type.Compat<T>) {
    const type = this.constructor as typeof Type;
    await type.connection.update(this.table, id, this.write(data, true));
  }

  static async new<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>): Promise<T>;
  static async new<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>[]): Promise<void>;
  static async new<T extends Type, U>(this: Type.Class<T>, data: Array<U>, mapFn: (item: U) => Type.Insert<T>): Promise<void>;
  static async new<T extends Type>(
    this: Type.Class<T>,
    data: Values<T> | unknown[],
    mapFn?: (item: unknown) => any
  ) {
    const insert = async (d: Values<T>, returns?: boolean) => {
      const input = this.write({ ...d as any, ...this.subset });
      const inserted = await this.connection.insert(this.table, input, returns);
      return this.from(inserted) as T;
    };

    if (Array.isArray(data)) {
      await Promise.all(data.map(mapFn || (x => x)).map(x => insert(x)))
      return;
    }

    return insert(data, true);
  }

  static async one<T extends Type>(this: Type.Class<T>, id: number, expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, id: number, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where: Type.Query<T>, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: true): Promise<T>;
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
    const { connection, subset, table } = this;

    if (!from)
      from = { id: desc() };

    if (!Array.isArray(from))
      from = buildConstraints({ ...from, ...subset });

    const rows = await connection.get(table, from, limit, offset);
    return rows.map(row => this.from(row) as T)
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