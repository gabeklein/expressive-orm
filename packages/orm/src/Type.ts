import { Model } from '@expressive/mvc';

import { Connection } from './Connection';
import { DIRTY, FIELDS, num } from './fields';
import { Field, Omits, Optional, underscore } from './Field';
import { Query } from './query/Query';
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

type Fields<T extends Type> = Exclude<keyof T, Exclude<keyof Type, "id"> | ClassKeys<T>>;

type Inserts<T> = T extends Type ? T | T["id"] | Type.Insert<T> : T;

type Insert<T extends Type> = {
  [K in Fields<T> as (Omits<T[K]> extends true ? never : K)]: Inserts<T[K]>;
} & {
  [K in Fields<T> as (Omits<T[K]> extends true ? K : never)]?: Inserts<T[K]>;
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

  type Connection = import('./Connection').Connection.Ready;

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

class NotReady extends Connection {
  select(){
    return reject();
  }

  insert(){
    return reject();
  }

  update(){
    return reject();
  }

  remove(){
    return reject();
  }
}

let DETACHED: Connection | undefined;

const INSERT = new WeakSet<Type>();
const SAVED = new WeakMap<Type, Record<string, unknown> | null>();

async function decode(type: typeof Type, row: Record<string, any>, partial?: boolean) {
  const values: Record<string, unknown> = {};

  for (const field of type.fields.values())
    if (!partial || field.column in row)
      values[field.key] = await field.get(row[field.column], row);

  return values;
}

function settle(entity: Type, values: Record<string, unknown>, row: Record<string, any>) {
  const { fields } = entity.constructor as typeof Type;
  const dirty = DIRTY.get(entity);
  const saved = SAVED.get(entity) || {};

  entity.set(values as Model.Assign<Type>);

  for (const key in values) {
    const { column } = fields.get(key)!;

    saved[column] = row[column];

    if (dirty)
      delete dirty[key];
  }

  SAVED.set(entity, saved);
}

async function receive(connection: Type.Connection, { table, op, id, row }: Connection.Change) {
  for (const [type, loaded] of connection._loaded) {
    if (type.ref !== table)
      continue;

    const primary = type.fields.get("id")!;
    const key = await primary.get(id);
    const entity = loaded.get(key);

    if (!entity || op == "insert")
      continue;

    if (op == "delete") {
      loaded.delete(key);
      SAVED.set(entity, null);
      entity.set(null);
      continue;
    }

    const [current = {}] = row ? [row] : await connection.select(table, [[primary.column, "=", id]], 1);
    const values = await decode(type, current, true);
    const dirty = DIRTY.get(entity)!;
    const apply: Record<string, unknown> = {};

    for (const key in values) {
      const next = values[key];

      if (key in dirty || next instanceof Date && +next === +(entity as any)[key])
        continue;

      apply[key] = next;
    }

    settle(entity, apply, current);
  }
}

function exists(entity: Type) {
  if (SAVED.get(entity) === null)
    throw new Error(`${entity.constructor.name} ${entity.id} was deleted.`);
}

abstract class Type extends Model {
  id: Optional<string | number> = num({ primary: true, increment: true });

  static get loaded(){
    const { connection } = this;
    const types = connection._loaded;
    let map = types.get(this);

    if (!map) {
      if (!types.size && connection.subscribe && !connection.get(null))
        connection.get(null, connection.subscribe(change => receive(connection, change)));

      types.set(this, map = new Map());
    }

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

  async save(): Promise<this> {
    exists(this);

    const type = this.constructor as typeof Type;
    const { connection, loaded, ref } = type;
    const dirty = DIRTY.get(this) || {};

    if (INSERT.delete(this) || this.id == null) {
      const row = await type.prepare({ ...dirty, ...type.subset } as Type.Update<Type>);
      const inserted = await connection.insert(ref, row, true);

      settle(this, await decode(type, inserted), inserted);
      loaded.set(this.id, this);

      return this;
    }

    const saved = SAVED.get(this) || {};
    const data: Record<string, unknown> = {};

    for (const key in dirty)
      data[key] = dirty[key] ?? null;

    const row = await type.prepare(data as Type.Update<Type>, true);

    for (const column in row)
      if ((row[column] ?? null) === (saved[column] ?? null))
        delete row[column];

    if (Object.keys(row).length) {
      await connection.update(ref, this.id, row);
      settle(this, await decode(type, row, true), row);
    }

    return this;
  }

  async update(data: Type.Update<this>) {
    exists(this);
    this.set(data as Model.Assign<this>);
    await this.save();
  }

  async delete() {
    exists(this);

    const type = this.constructor as typeof Type;
    const { connection, loaded, ref } = type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(ref, this.id);

    loaded.delete(this.id);
    SAVED.set(this, null);
    this.set(null);
  }

  static schema?: string;
  static subset?: Record<string, unknown>;
  static get connection(): Type.Connection {
    return DETACHED ||= NotReady.new();
  }

  static set connection(value: Type.Connection) {
    Object.defineProperty(this, 'connection', { value, writable: true, configurable: true });
  }

  static get table(): string {
    return underscore(this.name);
  }

  static set table(value: string) {
    Object.defineProperty(this, 'table', { value, writable: true });
  }

  static get ref() {
    const { schema, table } = this;
    return schema ? `${schema}.${table}` : table;
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
    const values = await decode(this, raw);
    let entity = this.loaded.get(values.id) as T | undefined;

    if (!entity)
      this.loaded.set(values.id, entity = (this as any).new(values) as T);

    settle(entity, values, raw);

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
    const { connection, loaded, ref } = this;
    const row = await this.prepare(data, true);
    const entity = loaded.get(id);

    await connection.update(ref, id, row);

    if (entity)
      settle(entity, await decode(this, row, true), row);
  }

  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>): Promise<T> {
    const entity = (this as any).new(data) as T;

    INSERT.add(entity);

    return entity.save();
  }

  static async one<T extends Type>(this: Type.Class<T>, id: T["id"], expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, id: T["id"], reload?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where: Type.Query<T>, expect: boolean): Promise<T | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where?: T["id"] | Type.Query<T>, arg?: boolean): Promise<T | undefined> {
    if (where != null && typeof where != "object"){
      if(!arg) {
        const cached = this.loaded.get(where);

        if(cached)
          return cached as T;
      }

      where = { id: equal(where) };
    }

    const [row] = await this.fetch(where, 1);

    if (!row && arg !== false)
      throw new Error(`No ${this.name} found with: \n${JSON.stringify(where, null, 2)}\n`);

    return row;
  }

  static query<T extends Type, R extends {}>(
    this: Type.Class<T>,
    where: (self: Query.From<T>, where: Query.Where) => R
  ): Query.Selects<R>;
  static query<T extends Type>(
    this: Type.Class<T>,
    where?: (self: Query.From<T>, where: Query.Where) => void
  ): Query.Selects<Query.From<T>>;
  static query(this: Type.Class, where?: (self: any, where: Query.Where) => unknown){
    return Query(from => {
      const self = from(this);
      return where && where(self, from) || self;
    });
  }

  protected static async fetch<T extends Type>(
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

    const rows = await connection.select(ref, query, limit, offset);
    return Promise.all(rows.map(row => this.parse(row) as Promise<T>));
  }

  static async find<T extends Type>(
    this: Type.Class<T>,
    where?: Type.Query<T>,
    limit?: number,
    offset?: number
  ) {
    return this.fetch(where, limit, offset);
  }

  static async *all<T extends Type>(
    this: Type.Class<T>,
    pageSize: number,
    where?: Type.Query<T>
  ): AsyncGenerator<T[]> {
    let offset = 0;
    let done = false;

    while (!done) {
      const batch = await this.fetch(where, pageSize, offset);

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