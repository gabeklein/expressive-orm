import { Context, Model } from '@expressive/mvc';

import { Connection } from './Connection';
import { FIELDS, Key, num, PEEK, placeholder, write } from './fields';
import { columns, Field, Fixes, fixes, match, Omits, Optional, present, row, underscore, updates } from './Field';
import { Query } from './query/Query';
import type { Moment } from './query/Value';
import type { Rows } from './rows';
import { desc, equal, Where } from './where';

type Compat<T extends Type> = {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class | Rows<any, any> ? never : K
  )]?: T[K];
}

type Update<T extends Type> = {
  [K in Exclude<keyof T, keyof Type>]?: Fixes<T[K]> extends true ? never : Inserts<T[K]> | Clears<T[K]>
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

type Inserts<T> = T extends Type ? T | T["id"] | Type.Insert<T> : T | Moment<T>;

type Insert<T extends Type> = {
  [K in Fields<T> as (Omits<T[K]> extends true ? never : K)]: Inserts<T[K]> | Clears<T[K]>;
} & {
  [K in Fields<T> as (Omits<T[K]> extends true ? K : never)]?: Inserts<T[K]> | Clears<T[K]>;
};

type Matches<T> = (T extends Type ? T | T["id"] | Type.Compat<T> : T | Moment<T>) | Clears<T>;

type Id<T extends Type> = T["id"] | (T["id"] extends Key<infer P> ? Readonly<P> : never);

type Conflict<T extends Type> = {
  conflict: "update" | "replace" | "ignore";
  on?: Fields<T> | Fields<T>[];
  keep?: Fields<T>[];
};

declare namespace Type {
  type Class<T extends Type = Type> = (abstract new (...args: any[]) => T) & typeof Type;

  type Async<T> = T & {
    then<A = T, B = never>(
      onfulfilled?: ((value: T) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): Promise<A | B>;
  };

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
    Async,
    Class,
    Columns,
    Compat,
    Conflict,
    Connection,
    Id,
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

const HANDLED = new WeakSet<object>();
const AWAITED = new WeakSet<Type>();
const PENDING = new WeakSet<Type>();

async function decode(type: typeof Type, row: Record<string, any>, partial?: boolean) {
  const values: Record<string, unknown> = {};

  for (const field of type.fields.values())
    if (!partial || field.column in row)
      values[field.key] = await field.get(row[field.column] ?? undefined, row);

  return values;
}

function journal(entity: Type) {
  return (entity.constructor as typeof Type).connection._journal();
}

function track(entity: Type, values: Record<string, unknown>) {
  const record = journal(entity);

  if (!record || PENDING.has(entity))
    return;

  const before: Record<string, unknown> = {};

  PEEK.add(entity.is);

  try {
    for (const key in values)
      before[key] = (entity as any)[key];
  }
  finally {
    PEEK.delete(entity.is);
  }

  record.undo.push(() => {
    const key = slot(entity.id);

    settle(entity, before);
    rekey(entity, key);
  });
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
    const key = slot(await primary.get(id));
    const entity = loaded.get(key);

    if (!entity || op == "insert")
      continue;

    if (op == "delete") {
      evict(loaded, key, entity);
      continue;
    }

    const [current = {}] = row ? [row] : await connection.select(table, match(primary, id), 1);
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

function slot(id: unknown) {
  return Array.isArray(id) ? JSON.stringify(id) : id;
}

function locate(type: typeof Type, id: unknown): Connection.Key {
  return type.fields.get("id")!.parts && typeof id == "string" ? JSON.parse(id) : id as Connection.Key;
}

function rekey(entity: Type, before: unknown) {
  const { loaded } = entity.constructor as typeof Type;
  const after = slot(entity.id);

  if (after !== before) {
    loaded.delete(before);
    loaded.set(after, entity);
  }
}

function retire(entity: Type, key: unknown) {
  const { loaded } = entity.constructor as typeof Type;
  const record = journal(entity);

  if (record)
    record.done.push(() => evict(loaded, key, entity));
  else
    evict(loaded, key, entity);
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

function awaitable<T extends Type>(entity: T): Type.Async<T> {
  function then(this: T, resolve?: (value: T) => unknown, reject?: (reason: unknown) => unknown){
    AWAITED.add(entity);

    return entity.get(() => {}).then(() => {
      delete (entity as any).then;
      return this;
    }).then(resolve, reject);
  }

  Object.defineProperty(entity, "then", { configurable: true, value: then });
  const loaded = () => PENDING.delete(entity);

  PENDING.add(entity);
  entity.get(() => {}).then(loaded, loaded);

  return entity as Type.Async<T>;
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
    const { connection, ref } = type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(ref, locate(type, this.id));
    retire(this, slot(this.id));
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
  static get<T extends Type>(this: Model.Extends<T>, id: Type.Id<T>): Type.Async<T>;
  static get<T extends Type>(this: Model.Extends<T>, id?: Type.Id<T> | false): T | undefined {
    if (typeof id != "number" && typeof id != "string" && !Array.isArray(id))
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

  static new<T extends Model>(this: Model.Type<T>, values: T extends Type ? Type.Insert<T> : never): Type.Async<T> {
    const type = this as unknown as typeof Type;

    return awaitable(placeholder(() => (Model.new as Function).call(type, async (entity: Type) => {
      const { loaded } = type;

      try {
        const row = await type.prepare({ ...values, ...type.subset } as Type.Update<Type>);
        const inserted = await type.connection.insert(type.ref, row, true);

        settle(entity, await decode(type, inserted));
        loaded.set(slot(entity.id), entity);
        journal(entity)?.undo.push(() => evict(loaded, slot(entity.id), entity));
      }
      catch (error) {
        if (AWAITED.has(entity))
          HANDLED.add(error as object);

        throw error;
      }
    }) as T & Type));
  }

  static async update<T extends Type>(this: Type.Class<T>, id: Type.Id<T>, data: Type.Update<T>): Promise<void>;
  static async update<T extends Type>(this: Type.Class<T>, where: Type.Query<T>, data: Type.Update<T>): Promise<number>;
  static async update<T extends Type>(this: Type.Class<T>, id: Type.Id<T> | Type.Query<T>, data: Type.Update<T>): Promise<void | number> {
    if (isQuery(id))
      return updateWhere(this, id, data);

    const { connection, loaded, ref } = this;
    const row = await this.prepare(data, true);
    const key = slot(id);
    const entity = loaded.get(key);

    await connection.update(ref, locate(this, id), row);

    if (entity) {
      const values = await decode(this, row, true);

      track(entity, values);
      settle(entity, values);
      rekey(entity, key);
    }
  }

  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options: Type.Conflict<T> & { conflict: "ignore" }): Promise<Type.Columns<T> | undefined>;
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options?: Type.Conflict<T> & { conflict: "update" | "replace" }): Promise<Type.Columns<T>>;
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options: Type.Conflict<T>): Promise<Type.Columns<T> | undefined>;
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options?: Type.Conflict<T>){
    const { connection, fields, loaded, ref, subset } = this;
    const updating: Record<string, unknown> = {};

    if (options && options.conflict != "ignore")
      for (const [key, field] of fields)
        if (field.update !== undefined)
          updating[key] = updates(field);

    const input = await this.prepare({ ...updating, ...data, ...subset } as Type.Update<T>);

    register(this);

    const inserted = await connection.insert(ref, input, true, options && conflict(this, input, options));

    if (!inserted)
      return;

    const columns = await row(fields, inserted) as Type.Columns<T>;
    const entity = loaded.get(slot(columns.id));

    if (entity) {
      const values = await decode(this, inserted);

      track(entity, values);
      settle(entity, values);
    }

    return columns;
  }

  static async delete<T extends Type>(this: Type.Class<T>, id: Type.Id<T>): Promise<void>;
  static async delete<T extends Type>(this: Type.Class<T>, where: Type.Query<T>): Promise<number>;
  static async delete<T extends Type>(this: Type.Class<T>, id: Type.Id<T> | Type.Query<T>): Promise<void | number> {
    if (isQuery(id))
      return deleteWhere(this, id);

    const { connection, loaded, ref } = this;
    const key = slot(id);

    await connection.remove(ref, locate(this, id));

    const entity = loaded.get(key);

    if (entity)
      retire(entity, key);
  }

  static async count<T extends Type>(this: Type.Class<T>, where: Type.Query<T> = {}): Promise<number> {
    return matching(this, conditions(this, where, true));
  }

  static async one<T extends Type>(this: Type.Class<T>, where: Type.Id<T> | Type.Query<T> | undefined, expect: boolean): Promise<Type.Columns<T> | undefined>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Id<T> | Type.Query<T>, expect?: true): Promise<Type.Columns<T>>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Id<T> | Type.Query<T>, expect?: boolean){
    if (where != null && (typeof where != "object" || Array.isArray(where)))
      where = { id: equal(where) };

    const [row] = await this.fetch(where as Type.Query<T> | undefined, 1);

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

    if (field?.parts) {
      if (op != "=" && op != "asc" && op != "desc")
        throw new Error(`${type.name}.${key} is a composite key and can only be matched or ordered.`);

      const parts = locate(type, value) as unknown[];

      for (const [i, part] of field.parts.entries())
        query.push([part.column, op, op == "=" ? await part.set(parts[i], true) : undefined]);
    }
    else if (field) {
      const computed = op.includes("LIKE") ? value : Array.isArray(value)
        ? Promise.all(value.map(v => field.set(present(v), true)))
        : field.set(present(value), true);

      query.push([field.column, op, await computed]);
    }
  }

  register(type);

  return connection.select(ref, query, limit, offset);
}

function reference<T extends Type>(type: Type.Class<T>, id: Type.Id<T>): T {
  const { loaded } = type;
  const key = slot(id);
  const cached = loaded.get(key);

  if (cached)
    return cached as T;

  const { parts } = type.fields.get("id")!;
  const values = parts ? Object.fromEntries(parts.map((part, i) => [part.key, (locate(type, id) as unknown[])[i]])) : { id };
  const entity = placeholder(() => (Model.new as Function).call(type, values, load) as T);

  async function load(){
    try {
      const [row] = await select(type, { id: equal(id) }, 1);

      if (!row) {
        const error = new Error(`No ${type.name} found with id ${id}`);

        HANDLED.add(error);
        throw error;
      }

      settle(entity, await decode(type, row));
    }
    catch (error) {
      if (loaded.get(key) === entity)
        loaded.delete(key);

      throw error;
    }
  }

  loaded.set(key, entity);

  return awaitable(entity);
}

async function persist(entity: Type, patch: Type.Update<Type>) {
  exists(entity);

  const type = entity.constructor as typeof Type;
  const row = await type["prepare"](patch, true);
  const key = slot(entity.id);

  if (Object.keys(row).length)
    await type.connection.update(type.ref, locate(type, entity.id), row);

  const values = await decode(type, row, true);

  track(entity, values);

  const updated = settle(entity, values);

  rekey(entity, key);

  return updated;
}

function conflict<T extends Type>(type: typeof Type, input: Record<string, unknown>, options: Type.Conflict<T>) {
  const { fields } = type;
  const column = (key: unknown) => fields.get(key as string)!.column;
  const on = options.on ? [options.on].flat().map(column) : columns(fields.get("id")!);
  const keep = (options.keep || []).map(column);

  const fixed = Array.from(fields.values()).filter(field => field.fixed).map(field => field.column);
  const skip = (key: string) => on.includes(key) || keep.includes(key) || fixed.includes(key);
  const all = Array.from(fields.values()).filter(field => !field.absent && !field.parts).map(field => field.column);

  return {
    on,
    update:
      options.conflict == "update" ? Object.keys(input).filter(key => !skip(key)) :
      options.conflict == "replace" ? all.filter(key => !skip(key)) :
      undefined
  };
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
    if (!HANDLED.has(error as object))
      return error;
  }
});

function isQuery(where: unknown): where is Type.Query<any> {
  return typeof where == "object" && where !== null && !Array.isArray(where);
}

function conditions(type: typeof Type, where: Type.Query<any>, empty?: boolean){
  const constraints = buildConstraints({ ...where, ...type.subset })
    .filter(([, op]) => op != "asc" && op != "desc");

  if (!empty && !constraints.length)
    throw new Error(`${type.name} needs a condition to write by query.`);

  return constraints;
}

function matching(type: typeof Type, constraints: Type.Constraint[], act?: (verbs: Query.Verbs<any>) => void){
  return Query(function(from){
    const self = from(type);
    const { fields } = this.tables.get(self)!;

    for (const [key, op, value] of constraints) {
      const field = fields.get(key)!;

      if (field.parts) {
        if (op != "=")
          throw new Error(`${type.name}.${key} is a composite key and can only be matched or ordered.`);

        const parts = locate(type, value) as unknown[];

        field.parts.forEach((part, i) => this.where(fields.get(part.key)!, "=", parts[i]));
      }
      else if (op == "IS NULL" || op == "IS NOT NULL")
        this.where(field, op == "IS NULL" ? "=" : "<>", null);
      else
        this.where(field, op == "!=" ? "<>" : op, Array.isArray(value) ? value.map(present) : present(value));
    }

    if (act)
      act(from(self));
  });
}

async function updateWhere(type: typeof Type, where: Type.Query<any>, data: Type.Update<any>){
  const { fields, loaded } = type;
  const constraints = conditions(type, where);
  const values: Record<string, unknown> = {};

  for (const [key, field] of fields) {
    const given = (data as Record<string, unknown>)[key];
    const value = given === undefined ? updates(field) : given;

    if (field.fixed)
      fixes(field, given);
    else if (value !== undefined)
      values[key] = present(value);
  }

  const affected = loaded.size ? await select(type, constraints) : [];
  const count = await matching(type, constraints, verbs => verbs.update(values));

  if (affected.length) {
    const changed = await decode(type, await type["prepare"](values as Type.Update<Type>, true), true);

    for (const raw of affected) {
      const { id } = await row(fields, raw);
      const key = slot(id);
      const entity = loaded.get(key);

      if (entity) {
        track(entity, changed);
        settle(entity, changed);
        rekey(entity, key);
      }
    }
  }

  return count;
}

async function deleteWhere(type: typeof Type, where: Type.Query<any>){
  const { fields, loaded } = type;
  const constraints = conditions(type, where);
  const affected = loaded.size ? await select(type, constraints) : [];
  const count = await matching(type, constraints, verbs => verbs.delete());

  for (const raw of affected) {
    const key = slot((await row(fields, raw)).id);
    const entity = loaded.get(key);

    if (entity)
      retire(entity, key);
  }

  return count;
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
        val instanceof Where ? [key, val.op || "=", val.value] :
        val === null ? [key, "IS NULL", undefined] :
        [key, '=', val]
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