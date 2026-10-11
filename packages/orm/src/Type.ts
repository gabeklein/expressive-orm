import { State } from '@expressive/mvc';

import { FIELDS, num } from './fields';
import { Field, underscore } from './Field';
import type { Rows } from './rows';
import { desc, equal, Where } from './where';

type Values<T extends Type> = {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class | Rows<any, any> ? never : K
  )]: T[K];
}

type Compat<T extends Type> = Partial<Values<T>>;

type Update<T extends Type> = {
  [K in Exclude<keyof T, keyof Type>]?: Inserts<T[K]>
}

type ClassKeys<T> = {
  [K in keyof T]: T[K] extends Type.Class | Rows<any, any> | ((...args: any[]) => any) ? K : never
}[keyof T];

type Fields<T extends Type> = Exclude<keyof T, keyof Type | ClassKeys<T>>;

type Inserts<T> = T extends Type ? T | T["id"] | Type.Insert<T> : T;

type Insert<T extends Type> = {
  [K in Fields<T> as (undefined extends T[K] ? never : K)]: Inserts<T[K]>;
} & {
  [K in Fields<T> as (undefined extends T[K] ? K : never)]?: Inserts<T[K]>;
};

type Matches<T> = T extends Type ? T | T["id"] | Type.Compat<T> : T;

declare namespace Type {
  type Class<T extends Type = Type> = (abstract new (...args: any[]) => T) & typeof Type;

  type Instance<T> = T extends Class<infer U> ? U : T;

  type KeyOf<T> = T extends Class<infer U> ? keyof U : keyof T;

  type Result<T extends Type> = PromiseLike<T[]>;

  type Conds<T> = Where | T | Conds<T>[]

  type Query<T extends {}> = {
    [K in keyof T]?: Conds<Matches<T[K]>>;
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
    Update,
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

const LOADED = new WeakMap<Type.Connection, Map<typeof Type, Map<number, Type>>>();

interface Type {
  set(): State.Updated<this>;
  set(assign?: Type.Compat<this>, silent?: boolean): State.Updated<this>;
  set(callback: State.OnEvent<this>): () => boolean;
  set(key: State.Event<this>): State.Updated<this>;
  set(status: null): void;
  set<K extends State.Event<this>>(event: K | null, callback: State.OnEvent<this>): () => boolean;
  set<K extends State.Event<this>>(key: K, config: State.Define<this, K>): State.Updated<this>;
}

abstract class Type extends State {
  id = num({ optional: true });

  static get loaded(){
    let types = LOADED.get(this.connection);

    if(!types)
      LOADED.set(this.connection, types = new Map());

    let map = types.get(this);

    if(!map)
      types.set(this, map = new Map());

    return map;
  }

  get values() {
    const values: Record<string, any> = {};
    const type = this.constructor as typeof Type;

    for (const [key] of type.fields)
      values[key] = (this as any)[key];

    return Object.freeze(values) as Values<this>;
  };

  protected async onDelete?(): Promise<void>;

  async update(data: Type.Update<this>) {
    if (Object.keys(data).length === 0)
      return;

    const type = this.constructor as typeof Type
    const row = await type.prepare(data, true);
    await type.connection.update(type.ref, this.id, row);

    for (const field of type.fields.values())
      if (field.column in row)
        (this as any)[field.key] = await field.get(row[field.column], row);
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
    let fields = FIELDS.get(this);

    if (!fields) {
      (this as any).new().set(null);
      fields = FIELDS.get(this)!;
    }

    return fields;
  }

  protected static async parse<T extends Type>(
    this: Type.Class<T>,
    raw: Record<string, any>
  ){
    const values: Record<string, unknown> = {};

    for (const field of this.fields.values())
      values[field.key] = await field.get(raw[field.column], raw);

    let entity = this.loaded.get(values.id as number) as T | undefined;

    if (entity)
      entity.set(values as Type.Compat<T>);
    else
      this.loaded.set(values.id as number, entity = (this as any).new(values) as T);

    return entity;
  }

  protected static async prepare<T extends Type>(
    this: Type.Class<T>,
    data: Update<T>,
    partial?: boolean
  ){
    const row: Record<string, any> = {};

    for (const field of this.fields.values())
      await field.apply(row, data, partial);

    return row;
  }

  static async update<T extends Type>(this: Type.Class<T>, id: T["id"], data: Type.Update<T>) {
    await this.connection.update(this.ref, id, await this.prepare(data, true));
  }

  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>){
    const row = await this.prepare({ ...data as any, ...this.subset });
    const inserted = await this.connection.insert(this.ref, row, true);

    return await this.parse(inserted) as T;
  }

  static async one<T extends Type>(this: Type.Class<T>, id: number, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, id: number, reload?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where: Type.Query<T>, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where?: number | Type.Query<T>, arg?: boolean): Promise<T | undefined> {
    if (typeof where === "number"){
      if(!arg) {
        const cached = this.loaded.get(where);

        if(cached)
          return cached as T;
      }

      where = { id: equal(where) };
    }

    const [row] = await this.query(where, 1);

    if (!row && arg !== false)
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

    const query = [] as Type.Constraint[];

    for (let [key, op, value] of from) {
      const field = this.fields.get(key);

      if(field){
        const computed = Array.isArray(value)
          ? Promise.all(value.map(v => field.set(v, true)))
          : field.set(value, true);

        query.push([field.column, op, await computed]);
      }
    }

    const rows = await connection.get(ref, query, limit, offset);
    return Promise.all(rows.map(row => this.parse(row) as Promise<T>));
  }

  static async find<T extends Type>(
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