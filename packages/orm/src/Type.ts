import { Context, Model } from '@expressive/mvc';

import { Connection } from './Connection';
import { FIELDS, num, PEEK, placeholder, write } from './fields';
import { Field, Omits, Optional, row, underscore } from './Field';
import { Query } from './query/Query';
import type { Rows } from './rows';
import { desc, equal, Where } from './where';

type Compat<T extends Type> = {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class | Rows<any, any> ? never : K
  )]?: T[K];
}

type Update<T extends Type> = {
  [K in Exclude<keyof T, keyof Type>]?: Inserts<T[K]> | Clears<T[K]>
}

type ClassKeys<T> = {
  [K in keyof T]: T[K] extends Type.Class | Rows<any, any> | ((...args: any[]) => any) ? K : never
}[keyof T];

type Fields<T extends Type> = Exclude<keyof T, Exclude<keyof Type, "id"> | ClassKeys<T>>;

type Column<T> = T extends Type ? T["id"] : T;

type Columns<T extends Type> = Pick<T, "id"> & {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class | Rows<any, any> | ((...args: any[]) => any) ? never : K
  )]: Column<T[K]>;
}

type Clears<T> = undefined extends T ? null : never;

type Inserts<T> = T extends Type ? T | T["id"] | Type.Insert<T> : T;

type Insert<T extends Type> = {
  [K in Fields<T> as (Omits<T[K]> extends true ? never : K)]: Inserts<T[K]> | Clears<T[K]>;
} & {
  [K in Fields<T> as (Omits<T[K]> extends true ? K : never)]?: Inserts<T[K]> | Clears<T[K]>;
};

type Matches<T> = T extends Type ? T | T["id"] | Type.Compat<T> : T;

declare namespace Type {
  type Class<T extends Type = Type> = (abstract new (...args: any[]) => T) & typeof Type;

  type Instance<T> = T extends Class<infer U> ? U : T;

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
    Columns,
    Compat,
    Connection,
    Constraint,
    Insert,
    Instance,
    Query,
    Update
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

const MISSING = new WeakSet<object>();
const PENDING = new WeakSet<Type>();

async function decode(type: typeof Type, row: Record<string, any>, partial?: boolean) {
  const values: Record<string, unknown> = {};

  for (const field of type.fields.values())
    if (!partial || field.column in row)
      values[field.key] = await field.get(row[field.column] ?? undefined, row);

  return values;
}

function settle(entity: Type, values: Record<string, unknown>) {
  for (const key in values) {
    const next = values[key];

    if (next instanceof Date && +next === +entity.get(key as any, false))
      delete values[key];
  }

  return write(() => (Model.prototype.set as Function).call(entity, values) as Model.Updated<Type>);
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
      evict(loaded, key, entity);
      continue;
    }

    const [current = {}] = row ? [row] : await connection.select(table, [[primary.column, "=", id]], 1);
    settle(entity, await decode(type, current, true));
  }
}

function register(type: typeof Type){
  const { connection } = type;
  const types = connection._loaded;
  let map = types.get(type);

  if (!map) {
    if (!types.size && connection.subscribe && !connection.get(null))
      connection.get(null, connection.subscribe(change => receive(connection, change)));

    types.set(type, map = new Map());
  }

  return map;
}

function evict(loaded: Map<unknown, Type>, key: unknown, entity: Type) {
  loaded.delete(key);
  entity.set(null);
}

function exists(entity: Type) {
  const { name } = entity.constructor;

  if (entity.get(null))
    throw new Error(`${name} ${entity.id} was deleted.`);

  if (PENDING.has(entity))
    throw new Error(`${name} is not loaded yet.`);
}

function awaitable<T extends Type>(entity: T) {
  function then(this: T, resolve?: (value: T) => unknown, reject?: (reason: unknown) => unknown){
    return entity.get(() => {}).then(() => {
      delete (entity as any).then;
      return this;
    }).then(resolve, reject);
  }

  Object.defineProperty(entity, "then", { configurable: true, value: then });
  const loaded = () => PENDING.delete(entity);

  PENDING.add(entity);
  entity.get(() => {}).then(loaded, loaded);

  return entity;
}

abstract class Type extends Model {
  id: Optional<string | number> = num({ primary: true, increment: true });

  static get loaded(){
    return register(this);
  }

  get columns(): Type.Columns<this> {
    const columns: Record<string, unknown> = {};
    const { fields } = this.constructor as typeof Type;

    PEEK.add(this.is);

    try {
      for (const key of fields.keys())
        columns[key] = (this as any)[key];
    }
    finally {
      PEEK.delete(this.is);
    }

    return Object.freeze(columns) as Type.Columns<this>;
  }

  set columns(_: unknown) {
    throw new Error(`${this}.columns is read-only.`);
  }

  protected async onDelete?(): Promise<void>;

  set(): Model.Updated<this>;
  set(patch: Type.Update<this>): Model.Updated<this>;
  set(callback: Model.OnEvent<this>): () => boolean;
  set(key: Model.Event<this>): Model.Updated<this>;
  set(status: null): void;
  set<K extends Model.Event<this>>(event: K | null, callback: Model.OnEvent<this>): () => boolean;
  set<K extends Model.Event<this>>(key: K, config: Model.Define<this, K>): Model.Updated<this>;
  set(arg1?: unknown, arg2?: unknown): unknown {
    if (!arg1 || typeof arg1 != "object")
      return (super.set as Function)(arg1, arg2);

    const updated: Model.Event<this>[] = [];
    const done = persist(this.is, arg1 as Type.Update<Type>);

    return Object.assign(updated, {
      then: done.then.bind(done)
    }) as unknown as Model.Updated<this>;
  }

  async delete() {
    exists(this);

    const type = this.constructor as typeof Type;
    const { connection, loaded, ref } = type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(ref, this.id);
    evict(loaded, this.id, this);
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
      (Model.new as Function).call(this).set(null);
      fields = FIELDS.get(this)!;
    }

    return fields;
  }

  static get<T extends Type>(this: Model.Extends<T>): T;
  static get<T extends Type>(this: Model.Extends<T>, required: false): T | undefined;
  static get<T extends Type>(this: Model.Extends<T>, id: T["id"]): T;
  static get<T extends Type>(this: Model.Extends<T>, id?: T["id"] | false): T | undefined {
    if (typeof id != "number" && typeof id != "string")
      return super.get(id as false) as T | undefined;

    return Context.get(this, () => reference(this as unknown as Type.Class<T>, id));
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

  static new<T extends Model>(this: Model.Type<T>, values: T extends Type ? Type.Insert<T> : never): T {
    const type = this as unknown as typeof Type;

    return awaitable(placeholder(() => (Model.new as Function).call(type, async (entity: Type) => {
      const { loaded } = type;
      const row = await type.prepare({ ...values, ...type.subset } as Type.Update<Type>);
      const inserted = await type.connection.insert(type.ref, row, true);

      settle(entity, await decode(type, inserted));
      loaded.set(entity.id, entity);
    }) as T & Type));
  }

  static async update<T extends Type>(this: Type.Class<T>, id: T["id"], data: Type.Update<T>): Promise<void> {
    const { connection, loaded, ref } = this;
    const row = await this.prepare(data, true);
    const entity = loaded.get(id);

    await connection.update(ref, id, row);

    if (entity)
      settle(entity, await decode(this, row, true));
  }

  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>): Promise<Type.Columns<T>> {
    const { connection, ref, subset } = this;
    const input = await this.prepare({ ...data, ...subset } as Type.Update<T>);

    register(this);

    return row(this.fields, await connection.insert(ref, input, true)) as Promise<Type.Columns<T>>;
  }

  static async delete<T extends Type>(this: Type.Class<T>, id: T["id"]): Promise<void> {
    const { connection, loaded, ref } = this;

    await connection.remove(ref, id);

    const entity = loaded.get(id);

    if (entity)
      evict(loaded, id, entity);
  }

  static async one<T extends Type>(this: Type.Class<T>, where: T["id"] | Type.Query<T> | undefined, expect: boolean): Promise<Type.Columns<T> | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: T["id"] | Type.Query<T>, expect?: true): Promise<Type.Columns<T>>;
  static async one<T extends Type>(this: Type.Class<T>, where?: T["id"] | Type.Query<T>, expect?: boolean){
    if (where != null && typeof where != "object")
      where = { id: equal(where) };

    const [row] = await this.fetch(where, 1);

    if (!row && expect !== false)
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
    this: Type.Class<T>,
    from?: Type.Constraint[] | Type.Query<T>,
    limit?: number,
    offset?: number
  ){
    const rows = await select(this, from, limit, offset);
    return Promise.all(rows.map(raw => row(this.fields, raw) as Promise<Type.Columns<T>>));
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
  ): AsyncGenerator<Type.Columns<T>[]> {
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

async function select(
  type: typeof Type,
  from: Type.Constraint[] | Type.Query<any> = { id: desc() },
  limit?: number,
  offset: number = 0
){
  const { connection, subset, ref } = type;
  const constraints = Array.isArray(from) ? from : buildConstraints({ ...from, ...subset });
  const query = [] as Type.Constraint[];

  for (let [key, op, value] of constraints) {
    const field = type.fields.get(key);

    if(field){
      const computed = Array.isArray(value)
        ? Promise.all(value.map(v => field.set(v, true)))
        : field.set(value, true);

      query.push([field.column, op, await computed]);
    }
  }

  register(type);

  return connection.select(ref, query, limit, offset);
}

function reference<T extends Type>(type: Type.Class<T>, id: T["id"]): T {
  const { loaded } = type;
  const cached = loaded.get(id);

  if (cached)
    return cached as T;

  const entity = placeholder(() => (Model.new as Function).call(type, { id }, load) as T);

  async function load(){
    try {
      const [row] = await select(type, { id: equal(id) }, 1);

      if (!row) {
        const error = new Error(`No ${type.name} found with id ${id}`);

        MISSING.add(error);
        throw error;
      }

      settle(entity, await decode(type, row));
    }
    catch (error) {
      if (loaded.get(id) === entity)
        loaded.delete(id);

      throw error;
    }
  }

  loaded.set(id, entity);

  return awaitable(entity);
}

async function persist(entity: Type, patch: Type.Update<Type>) {
  exists(entity);

  const type = entity.constructor as typeof Type;
  const row = await type["prepare"](patch, true);

  if (Object.keys(row).length)
    await type.connection.update(type.ref, entity.id, row);

  return settle(entity, await decode(type, row, true));
}

async function adopt<T extends Type>(type: Type.Class<T>, id: T["id"]): Promise<T | undefined> {
  const { loaded } = type;
  let entity = loaded.get(id) as T | undefined;

  if (entity)
    return entity;

  const [raw] = await select(type, { id: equal(id) }, 1);

  if (!raw)
    return;

  const values = await decode(type, raw);

  entity = loaded.get(values.id) as T | undefined;

  if (!entity)
    loaded.set(values.id, entity = write(() => (Model.new as Function).call(type, values) as T));

  settle(entity, values);

  return entity;
}

Type.on({
  catch(error) {
    if (!MISSING.has(error as object))
      return error;
  }
});

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
  adopt,
  Type,
  Type as default,
  Columns,
  Compat,
  Insert,
};