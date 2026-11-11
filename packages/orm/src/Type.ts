import { Context, Model } from '@expressive/mvc';

import { Connection } from './Connection';
import { FIELDS, Key, num, PEEK, placeholder, RECENT, write } from './fields';
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

/** A row as statics resolve it - frozen, decoded by property, a relation as its id. */
type Columns<T extends Type> = Pick<T, "id"> & {
  [K in Exclude<keyof T, keyof Type> as (
    T[K] extends Type.Class | Rows<any, any> | ((...args: any[]) => any) ? never : K
  )]: Column<T[K]>;
}

type Clears<T> = undefined extends T ? null : never;

type Inserts<T> = T extends Type ? T | T["id"] | Type.Insert<T> : T | Moment<T>;

/**
 * Values for `insert` and `Type.new`.
 *
 * Nullable, defaulted and generated columns are optional. A relation takes an entity, an id, or values to insert as a new related row.
 */
type Insert<T extends Type> = {
  [K in Fields<T> as (Omits<T[K]> extends true ? never : K)]: Inserts<T[K]> | Clears<T[K]>;
} & {
  [K in Fields<T> as (Omits<T[K]> extends true ? K : never)]?: Inserts<T[K]> | Clears<T[K]>;
};

type Matches<T> = (T extends Type ? T | T["id"] | Type.Compat<T> : T | Moment<T>) | Clears<T>;

/** A primary key - the `id`, or for a composite key the tuple of its parts. */
type Id<T extends Type> = T["id"] | (T["id"] extends Key<infer P> ? Readonly<P> : never);

/** What an `insert` does when the row exists. */
interface Conflict<T extends Type> {
  /**
   * What happens to the existing row.
   *
   * `"update"` writes the columns given; `"replace"` every column, omitted ones reset; `"ignore"` leaves the row.
   */
  conflict: "update" | "replace" | "ignore";
  /** Properties identifying the existing row. Defaults to the primary key. */
  on?: Fields<T> | Fields<T>[];
  /** Properties an update or replace leaves as stored. */
  keep?: Fields<T>[];
}

declare namespace Type {
  /** An entity class - a `Type` subclass with its statics. */
  type Class<T extends Type = Type> = (abstract new (...args: any[]) => T) & typeof Type;

  /**
   * An entity still loading - await it for the entity once its row lands.
   *
   * Returned by `Type.get(id)` and `Type.new(values)`. Rejects when the row is missing or the insert fails. Awaiting it removes `then`, so the entity does not resolve again.
   */
  type Async<T> = T & {
    then<A = T, B = never>(
      onfulfilled?: ((value: T) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): Promise<A | B>;
  };

  /** The entity of a class; any other type passes through. */
  type Instance<T> = T extends Class<infer U> ? U : T;

  /**
   * Rows read a batch at a time - await it for the first batch, iterate it for every batch.
   *
   * From `query(where, limit, offset?)`. The first select runs at once; iterating starts with its batch, then selects `limit` more from where it left off until a batch comes back short.
   * Batches move by offset - a row inserted or deleted ahead of the reader shifts the rest.
   *
   * @example
   * for await (const batch of User.query({ admin: true }, 100))
   *   batch.forEach(send);
   */
  interface Batches<T extends Type> extends Promise<Columns<T>[]>, AsyncIterable<Columns<T>[]> {}

  /** A filter value - a plain value (equal), an operator, or an array applying each. */
  type Conds<T> = Where | T | Conds<T>[]

  /**
   * A filter by property - for `query`, `load`, `one`, `count` and writes by query.
   *
   * `null` matches a missing value. `undefined` drops the condition.
   * A relation takes an entity, an id, or an object of the related fields to match.
   */
  type Query<T extends {}> = {
    [K in keyof T]?: Conds<Matches<T[K]>>;
  };

  /**
   * A condition or ordering at the driver - `[column, op, value?]`.
   *
   * `op` is a comparison, `IS NULL`, `IS NOT NULL`, `asc` or `desc`.
   */
  type Constraint = [
    field: string,
    op: string,
    value?: any
  ]

  /** A connection once awaited - `Connection` without `then`. */
  type Connection = import('./Connection').Connection.Ready;

  export {
    Async,
    Batches,
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
  const changed = Object.fromEntries(Object.entries(values).filter(([key, next]) => (
    !(next instanceof Date && +next === +entity.get(key as any, false))
  )));

  return write(() => (Model.prototype.set as Function).call(entity, changed) as Model.Updated<Type>);
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

/**
 * Base class of an entity - a Model whose fields are columns and whose statics query its table.
 *
 * Statics resolve plain frozen rows. Instances are read-only references from `get(id)`, `new(values)` or a relation; write with `await entity.set(patch)`.
 * The table is the class name in snake case unless `static table` is set.
 *
 * @example
 * class User extends Type {
 *   name = str();
 *   email = str(unique);
 * }
 */
abstract class Type extends Model {
  /** Primary key - an incrementing integer unless redeclared with `key()`. */
  id: Optional<string | number> = num({ primary: true, increment: true });

  static get loaded(){
    return register(this);
  }

  /**
   * This entity's row - frozen, by property, a relation as its id.
   *
   * Reads a relation's id without loading it. Assigning throws.
   */
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

  /** Runs before `delete()` removes the row - a throw cancels it. Not called by the static `delete`. */
  protected async onDelete?(): Promise<void>;

  set(): Model.Updated<this>;
  /**
   * Write a patch to the row, then settle it into this entity.
   *
   * Resolves the keys that changed. `null` clears a nullable column. Columns with an `update` option are written too.
   * Rejects for a fixed column, a deleted entity, or one still loading. Inside a transaction a rollback restores the entity.
   *
   * @example
   * await user.set({ age: 28 });
   */
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

  /**
   * Delete this entity's row, then destroy the entity.
   *
   * Calls `onDelete` first. Inside a transaction the entity is destroyed on commit. Rejects when already deleted or still loading.
   */
  async delete() {
    exists(this);

    const type = this.constructor as typeof Type;
    const { connection, ref } = type;

    if (typeof this.onDelete === "function")
      await this.onDelete();

    await connection.remove(ref, locate(type, this.id));
    retire(this, slot(this.id));
  }

  /** Schema qualifying the table, as `schema.table`. */
  static schema?: string;
  /**
   * Values every row of this class holds - merged into inserts and into every query filter.
   *
   * Scopes a subclass to part of a shared table; give it the parent's `table`.
   * Reads by id (`get(id)`, `one(id)`) are scoped; writes by id (`update(id)`, `delete(id)`) and instance writes (`set`, `delete`) are not.
   * `Insert` still types the fields as required.
   *
   * @example
   * static table = "user";
   * static subset = { role: "admin" };
   */
  static subset?: Record<string, unknown>;
  /**
   * The connection this class reads and writes through.
   *
   * Set by `Connection.new([...])`, or assigned: `static connection = memory()`.
   * A class binds to one connection through `Connection.new([...])` - a second throws.
   * Unset, every statement rejects with `No database connection`.
   */
  static get connection(): Type.Connection {
    return DETACHED ||= NotReady.new();
  }

  static set connection(value: Type.Connection) {
    Object.defineProperty(this, 'connection', { value, writable: true, configurable: true });
  }

  /** Table name - the class name in snake case unless assigned. */
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

  /** Model's context lookup - the instance of this class in context; throws when there is none. */
  static get<T extends Type>(this: Model.Extends<T>): T;
  /** Model's context lookup - `undefined` when there is none. */
  static get<T extends Type>(this: Model.Extends<T>, required: false): T | undefined;
  /**
   * Reference an entity by id - synchronous, through the identity map.
   *
   * Returns the loaded entity, or a placeholder whose columns suspend until its row lands. Concurrent calls share one instance.
   * Await it for the loaded entity. A missing row rejects with `No <Class> found with id <id>`.
   * A composite key takes its tuple or its `id` string.
   *
   * @example
   * const user = User.get(1);
   * user.get(({ name }) => console.log(name));
   * await user;
   */
  static get<T extends Type>(this: Model.Extends<T>, id: Type.Id<T>): Type.Async<T>;
  static get<T extends Type>(this: Model.Extends<T>, id?: Type.Id<T> | false): T | undefined {
    if (typeof id != "number" && typeof id != "string" && !Array.isArray(id))
      return super.get(id as false) as T | undefined;

    return Context.get(this, () => reference(this as unknown as Type.Class<T>, id));
  }

  /**
   * Encode property values as a row keyed by column.
   *
   * Validates and fills fallbacks. `partial` encodes only the keys given plus `update` values, for an update.
   */
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

  /**
   * Insert a row and return its entity at once.
   *
   * Columns suspend until the row lands; await it for the entity with `id` and defaults. A failed insert destroys it and rejects.
   * Inside a transaction a rollback destroys it. For the row alone use `insert`.
   *
   * @example
   * const ann = await User.new({ name: "Ann" });
   * await ann.set({ age: 28 });
   */
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

  /**
   * Update one row by id.
   *
   * Settles the change into its loaded entity. Columns with an `update` option are written too. Throws for a fixed column.
   * A missing row is not an error.
   */
  static async update<T extends Type>(this: Type.Class<T>, id: Type.Id<T>, data: Type.Update<T>): Promise<void>;
  /**
   * Update every row matching a filter, resolving how many changed.
   *
   * Throws on an empty filter or a fixed column. Loaded entities among them settle the change.
   */
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

  /** Insert a row unless one exists - resolves the stored row, `undefined` when the existing one is left. */
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options: Type.Conflict<T> & { conflict: "ignore" }): Promise<Type.Columns<T> | undefined>;
  /**
   * Insert a row, resolving it as stored - `id`, defaults and generated values included.
   *
   * With `conflict: "update"` an existing row takes the columns given; with `"replace"` every column, omitted ones reset.
   * Fixed and `keep` columns stay; columns with an `update` option take that value. `on` names the properties identifying the row.
   * The change settles into a loaded entity.
   *
   * @example
   * await User.insert({ name: "Ann", email: "ann@example.com" });
   * await User.insert(row, { conflict: "update", on: "email" });
   */
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options?: Type.Conflict<T> & { conflict: "update" | "replace" }): Promise<Type.Columns<T>>;
  /** Insert with a conflict mode chosen at runtime - `undefined` when `"ignore"` leaves an existing row. */
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options: Type.Conflict<T>): Promise<Type.Columns<T> | undefined>;
  static async insert<T extends Type>(this: Type.Class<T>, data: Type.Insert<T>, options?: Type.Conflict<T>){
    const { connection, fields, loaded, ref, subset } = this;
    const given = { ...data, ...subset } as Type.Update<T>;
    const input = await this.prepare(given);
    const set = options && options.conflict != "ignore" ? await this.prepare({}, true) : {};

    register(this);

    const inserted = await connection.insert(ref, input, true, options && conflict(this, given, set, options));

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

  /**
   * Delete one row by id, destroying its loaded entity.
   *
   * A missing row is not an error; `onDelete` does not run.
   */
  static async delete<T extends Type>(this: Type.Class<T>, id: Type.Id<T>): Promise<void>;
  /**
   * Delete every row matching a filter, resolving how many.
   *
   * Throws on an empty filter. Loaded entities among them are destroyed; `onDelete` does not run.
   */
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

  /** Count rows matching a filter - the whole table when omitted. */
  static async count<T extends Type>(this: Type.Class<T>, where: Type.Query<T> = {}): Promise<number> {
    return matching(this, await conditions(this, where, true));
  }

  /** The live entity matching a filter - `undefined` when `expect` is false and none matches. */
  static async one<T extends Type>(this: Type.Class<T>, where: Type.Query<T> | undefined, expect: boolean): Promise<T | undefined>;
  /**
   * The live entity matching a filter; rejects when none matches.
   *
   * Loads as `load(where, 1)` does - a loaded entity settles the fetched row and is returned as is.
   * Without a filter, the newest by the class's default order; a class without one throws. Use `get(id)` for an id.
   *
   * @example
   * const admin = await User.one({ role: "admin" });
   */
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: true): Promise<T>;
  static async one<T extends Type>(this: Type.Class<T>, where?: Type.Query<T>, expect?: boolean){
    if (where !== undefined && !isQuery(where))
      throw new Error(`${this.name}.one() takes a filter - use get(id) for an id.`);

    if (!(where = newest(this, where)))
      throw new Error(`${this.name}.one() needs a filter - it has no created() column or incrementing id to order by.`);

    const [entity] = await this.load(where, 1);

    if (!entity && expect !== false)
      throw new Error(`No ${this.name} found with: \n${JSON.stringify(where, null, 2)}\n`);

    return entity;
  }

  /**
   * A `Query` over this table selecting what the callback returns.
   *
   * `self` is the table's columns; `where` is the `Query` function. Needs a connection with `prepare`.
   *
   * @example
   * const names = await User.query((user, where) => {
   *   where(user.admin).equal(true);
   *   return user.name;
   * });
   */
  static query<T extends Type, R extends {}>(
    this: Type.Class<T>,
    where: (self: Query.From<T>, where: Query.Where) => R
  ): Query.Selects<R>;
  /** A `Query` over this table selecting its rows - the callback only adds conditions. */
  static query<T extends Type>(
    this: Type.Class<T>,
    where: (self: Query.From<T>, where: Query.Where) => void
  ): Query.Selects<Query.From<T>>;
  /**
   * Rows matching a filter, as frozen columns - no entities.
   *
   * Without a filter, newest first: by a `created()` column then id, else an incrementing id, else unordered. A filter with a condition drops that order; order by a property with `asc()` / `desc()`.
   * Runs on any connection - it needs only `select`.
   *
   * @example
   * await User.query({ name: [isLike("G%"), asc()], age: greaterThan(17) });
   */
  static query<T extends Type>(
    this: Type.Class<T>,
    where?: Type.Query<T>,
    limit?: undefined,
    offset?: number
  ): Promise<Type.Columns<T>[]>;
  /**
   * Up to `limit` rows matching a filter - awaited, one batch; iterated, every match a batch at a time.
   *
   * A limited read is always in one order: the filter's `asc()` / `desc()`, else the class's newest first, then by id.
   * `offset` skips that many first.
   *
   * @example
   * const latest = await User.query({ admin: true }, 20);
   * for await (const batch of User.query({ admin: true }, 100))
   *   batch.forEach(send);
   */
  static query<T extends Type>(
    this: Type.Class<T>,
    where: Type.Query<T> | undefined,
    limit: number,
    offset?: number
  ): Type.Batches<T>;
  static query(this: Type.Class, where?: Type.Query<any> | ((self: any, where: Query.Where) => unknown), limit?: number, offset = 0){
    if (typeof where != "function")
      return limit === undefined ? this.fetch(where, limit, offset) : batches(this, where, limit, offset);

    return Query(from => {
      const self = from(this);
      return where(self, from) || self;
    });
  }

  /** Select and decode rows - the path under `query`. */
  protected static async fetch<T extends Type>(
    this: Type.Class<T>,
    from?: Type.Constraint[] | Type.Query<T>,
    limit?: number,
    offset?: number
  ){
    const rows = await select(this, from, limit, offset);
    return Promise.all(rows.map(raw => row(this.fields, raw) as Promise<Type.Columns<T>>));
  }

  /**
   * Find live entities matching a filter - one select for the whole call.
   *
   * Filters and orders as `query` does. A loaded entity settles its fetched row and is returned as is; others are created and loaded.
   * Omit `limit` for every match.
   *
   * @example
   * const posts = await Post.load({ author: user }, 20);
   * await posts[0].set({ title: "Hello" });
   */
  static async load<T extends Type>(
    this: Type.Class<T>,
    where?: Type.Query<T>,
    limit?: number,
    offset?: number
  ): Promise<T[]> {
    const rows = await select(this, where, limit, offset);

    return Promise.all(rows.map(async raw => {
      const values = await decode(this, raw);
      const { loaded } = this;
      const key = slot(values.id);
      let entity = loaded.get(key) as T | undefined;

      if (entity) {
        track(entity, values);
        settle(entity, values);
      }
      else
        loaded.set(key, entity = write(() => (Model.new as Function).call(this, values) as T));

      return entity;
    }));
  }
}

async function select(
  type: typeof Type,
  from?: Type.Constraint[] | Type.Query<any>,
  limit?: number,
  offset: number = 0
){
  const { connection, subset, ref } = type;
  const constraints = Array.isArray(from) ? [...from] : buildConstraints({ ...newest(type, from), ...subset });
  const query = [] as Type.Constraint[];

  if (limit)
    constraints.push(...settled(type, constraints));

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

function settled(type: typeof Type, constraints: Type.Constraint[]): Type.Constraint[] {
  const ordered = ([, op]: Type.Constraint) => op == "asc" || op == "desc";
  const added = constraints.some(ordered) ? [] : buildConstraints(newest(type) || {});
  const order = [...constraints, ...added].filter(ordered);

  if (!order.some(([key]) => key == "id"))
    added.push(["id", order.length ? order[0][1] : "desc", undefined]);

  return added;
}

function batches<T extends Type>(type: Type.Class<T>, where: Type.Query<T> | undefined, limit: number, offset: number): Type.Batches<T> {
  const first = type["fetch"](where, limit, offset);

  return Object.assign(first, {
    async *[Symbol.asyncIterator](){
      for (let batch = await first, at = offset; batch.length; batch = await type["fetch"](where, limit, at)) {
        yield batch;

        if (batch.length < limit || !limit)
          return;

        at += batch.length;
      }
    }
  });
}

function newest(type: typeof Type, where?: Type.Query<any>): Type.Query<any> | undefined {
  if (where && Object.values(where).some(value => value !== undefined))
    return where;

  for (const field of type.fields.values())
    if (RECENT in field)
      return { [field.key]: desc(), id: desc() };

  if (type.fields.get("id")!.increment)
    return { id: desc() };
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

function conflict<T extends Type>(type: typeof Type, given: Record<string, unknown>, set: Record<string, unknown>, options: Type.Conflict<T>) {
  const { fields } = type;
  const column = (key: unknown) => fields.get(key as string)!.column;
  const on = options.on ? [options.on].flat().map(column) : columns(fields.get("id")!);
  const keep = (options.keep || []).map(column);

  if (options.conflict == "ignore")
    return { on };

  const writable = Array.from(fields.values()).filter(field => (
    !field.absent && !field.parts && !field.fixed && !on.includes(field.column) && !keep.includes(field.column)
  ));

  const named = (field: Field) => given[field.key] !== undefined;
  const touched = (field: Field) => !named(field) && field.column in set;
  const replaced = (field: Field) => options.conflict == "replace" && !field.primary;

  return {
    on,
    update: writable.filter(field => !touched(field) && (named(field) || replaced(field))).map(field => field.column),
    set: Object.fromEntries(writable.filter(touched).map(field => [field.column, set[field.column]]))
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

async function conditions(type: typeof Type, where: Type.Query<any>, empty?: boolean){
  const constraints = buildConstraints({ ...where, ...type.subset })
    .filter(([, op]) => op != "asc" && op != "desc");

  if (!empty && !constraints.length)
    throw new Error(`${type.name} needs a condition to write by query.`);

  return Promise.all(constraints.map(async ([key, op, value]): Promise<Type.Constraint> => {
    const field = type.fields.get(key)!;
    const related = (value: unknown) => field.set(value, true);

    if ("entity" in field && value != null)
      value = Array.isArray(value) ? await Promise.all(value.map(related)) : await related(value);

    return [key, op, value];
  }));
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
  const constraints = await conditions(type, where);
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
  const constraints = await conditions(type, where);
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
  newest,
  Type,
  Type as default,
  Columns,
  Compat,
  Insert,
};