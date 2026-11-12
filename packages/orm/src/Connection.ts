import { Model } from '@expressive/mvc';

import type { Builder } from './query/Builder';
import type { Query } from './query/Query';
import { Field, match, row } from './Field';
import type { Columns, Type } from './Type';

declare namespace Connection {
  /** Entity classes to bind - an array, or an object of them. */
  type Types =
    | Query.Table[]
    | { [key: string | number]: Query.Table };

  /** A connection once awaited - without `then`, so it does not resolve again. */
  type Ready<T extends Connection = Connection> = Omit<T, "then">;

  /** A primary key at the driver - the id, or a composite key's parts in `key` order. */
  type Key = string | number | readonly (string | number)[];

  /** How an insert handles an existing row, by column. */
  interface Conflict {
    /** Columns identifying the existing row. */
    on: string[];
    /** Columns to overwrite from the insert. Absent, the existing row is left. */
    update?: string[];
    /** Values written on conflict, whatever the insert holds. */
    set?: Record<string, unknown>;
  }

  /** An open transaction's record on a connection. */
  interface Journal {
    /** Restore entities - run in reverse on rollback. */
    undo: (() => void)[];
    /** Deferred effects - run on commit. The transaction awaits any they return, after releasing the connection. */
    done: (() => unknown)[];
    /** The driver's own handle for the transaction's statements. */
    session?: unknown;
  }

  /** Host-side gates for a class's rows - registered with `before`. */
  interface Before<T extends Type = Type> {
    /**
     * Runs before a row is deleted by id, receiving it as `find` resolves it - a throw cancels the delete.
     *
     * Covers instance `delete()`, static `delete(id)` and `remove` called directly; a delete by filter skips it.
     * Runs inside the transaction when there is one. A missing row skips it.
     * A throw or rejection propagates to the caller; the row stays and no `after` handler runs.
     */
    delete?(row: Columns<T>): void | Promise<void>;
  }

  /** Host-side effects for a class's rows - registered with `after`. */
  interface After<T extends Type = Type> {
    /**
     * Runs after a row is deleted by id, receiving it as `find` resolves it - best effort.
     *
     * Covers instance `delete()`, static `delete(id)` and `remove` called directly; a delete by filter skips it.
     * Awaited before the delete resolves - inside a transaction, after commit and before `transaction` resolves, never after a rollback.
     * A throw or rejection is logged with `console.error`, never rejecting the delete.
     */
    delete?(row: Columns<T>): void | Promise<void>;
  }

  /**
   * How a driver stores the fields of one helper - chosen by `Field.helper`, keyed by the helper itself.
   *
   * A relation's column uses the codec of the key it references.
   */
  interface Codec<F extends Field = any> {
    /** `Field.type` values it can store - binding a class with another throws. */
    readonly types: readonly string[];
    /** Datatype as schema renders it, size and options included. */
    datatype(field: F): string;
    /** A plain value, already checked by the field, as stored. Not called for `null` or `undefined`. */
    encode(field: F, value: unknown): unknown;
    /** A stored value as plain. Not called for `null` or `undefined`. */
    decode(field: F, value: unknown): unknown;
  }

  /** A row change reported to `subscribe`'s listener. */
  interface Change {
    /** Table as the connection addresses it, schema included. */
    table: string;
    op: "insert" | "update" | "delete";
    id: Key;
    /** Changed values by column. Absent, a loaded entity selects its row again. */
    row?: Record<string, unknown>;
  }
}

type Scope = Map<Connection, Connection.Journal>;

type Codecs = ReadonlyMap<Function, Connection.Codec>;

type Hook<H> = { type: Type.Class; hooks: H };
type Hooks = { before: Set<Hook<Connection.Before<any>>>; after: Set<Hook<Connection.After<any>>> };

const synced = new WeakMap<Connection, Promise<unknown>>();
const HOOKED = new WeakSet<Connection>();
const COLLECT = Symbol.for("@expressive/orm.collect");

let context: import('node:async_hooks').AsyncLocalStorage<Scope> | undefined;

function scope(){
  if (context)
    return context;

  const hooks: typeof import('node:async_hooks') | undefined =
    (globalThis as any).process?.getBuiltinModule?.("node:async_hooks");

  if (!hooks)
    throw new Error("Transactions need AsyncLocalStorage from process.getBuiltinModule, which this runtime does not provide.");

  return context = new hooks.AsyncLocalStorage<Scope>();
}

function resolve(codecs: Codecs, name: string, field: Field): [Connection.Codec, Field] {
  const target = field.reference || field;
  const codec = codecs.get(target.helper!);

  if (!codec || !codec.types.includes(target.type))
    throw new Error(`${name} can't store ${target.helper?.name || "a field of"} type '${target.type}' (${field.parent?.name}.${field.key}).`);

  return [codec, target];
}

/**
 * Base class of a driver - a Model binding entity classes to a store.
 *
 * Implement `select`, `insert`, `update` and `remove`. `prepare`, `subscribe`, `sync` and `transact` are optional capabilities.
 * Create with `Connection.new(types)` and await it. Holds the identity map of entities loaded through it.
 */
let latest: Connection | undefined;

function check(target: Function, type: Query.Table){
  const codecs = Reflect.get(target.prototype, "codecs") as Codecs | undefined;

  if (type.hasOwnProperty('connection'))
    throw new Error(`Type ${type.name} already has assigned connection.`);

  if (codecs)
    for (const field of type.fields.values())
      if (!field.absent && !("entity" in field))
        resolve(codecs, target.name, field);
}

function ambient(type: Query.Table): Connection | undefined {
  const into = latest;

  if (into) {
    check(into.constructor, type);
    (into.using as Set<Query.Table>).add(type);
    type.connection = into;
  }

  return into;
}

function forget(connection: Connection){
  if (latest === connection)
    latest = undefined;
}

abstract class Connection extends Model {
  /** Entity classes bound at construction. */
  readonly using: ReadonlySet<Query.Table>;
  /** Set by a driver's `sync` once the schema is in place. */
  readonly ready: boolean = false;

  _active?: Promise<void>;
  _loaded = new Map<Type.Class, Map<unknown, Type>>();
  _hooks = new Map<string, Hooks>();

  /**
   * Binds each class to this connection.
   *
   * Throws when a class already has one. Construct with `Connection.new`.
   */
  constructor(using: Connection.Types = []){
    const types = Object.values(using);

    for (const type of types)
      check(new.target, type);

    super();

    this.using = new Set(types.map(type => {
      type.connection = this;
      return type;
    }));

    this.get(() => {
      latest = this;
    });

    this.get(null, () => {
      forget(this);

      for (const type of this.using)
        if (type.connection === this)
          delete type.connection;

      for (const loaded of this._loaded.values())
        for (const entity of loaded.values())
          entity.set(null);

      this._loaded.clear();
    });
  }

  /** Construct and activate a connection. Await the result to run `sync`. */
  static new<T extends Model, A extends unknown[]>(this: new (...args: A) => T, ...args: A): T {
    return Model.new.apply(this as any, args as any) as T;
  }

  /**
   * Lets the connection be awaited - runs `sync` once, then resolves the connection.
   *
   * `sync` runs only when the driver has one.
   */
  async then(
    onfulfilled?: (value: Connection.Ready<this>) => any,
    onrejected?: (reason: any) => any) {

    const collect = (globalThis as { [COLLECT]?: Set<Connection> })[COLLECT];
    let sync = synced.get(this);

    if (collect)
      collect.add(this);

    if (this.ready || !this.sync || collect)
      sync = Promise.resolve();
    else if (!sync)
      synced.set(this, sync = this.sync());

    return sync
      .then(() => {
        Object.defineProperty(this, 'then', { value: undefined });

        if (onfulfilled)
          onfulfilled(this);
      })
      .catch(onrejected);
  }

  /** Release the connection - unbinds its classes and destroys every entity loaded through it. */
  async close(){
    this.set(null);
  }

  /** Rows of `table` matching every constraint, keyed by column. `asc` and `desc` constraints order them. */
  abstract select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number): Promise<any[]>;

  /**
   * Insert `data`, keyed by column.
   *
   * Resolves the stored row when `returns` is set. With `conflict`, resolves nothing when an existing row is left.
   */
  abstract insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict): Promise<any>;

  /** Update the row with primary key `id`. A missing row is not an error. */
  abstract update(table: string, id: Connection.Key, data: Record<string, any>): Promise<void>;

  /** Delete the row with primary key `id`. A missing row is not an error. */
  abstract remove(table: string, id: Connection.Key): Promise<void>;

  _journal(){
    return context?.getStore()?.get(this);
  }

  /**
   * Codecs by base helper - how this driver stores each helper's fields.
   *
   * Unset, values pass through as they are, like `Memory.new()` or a connection forwarding to another.
   * Set, `Connection.new` throws for a field none of them can store.
   */
  protected get codecs(): Codecs | undefined {
    return undefined;
  }

  _codec(field: Field){
    const { codecs } = this;
    return codecs && resolve(codecs, this.constructor.name, field);
  }

  _encode(field: Field, value: unknown){
    const codec = value == null ? undefined : this._codec(field);
    return codec ? codec[0].encode(codec[1], value) : value;
  }

  _decode(field: Field, value: unknown){
    const codec = value == null ? undefined : this._codec(field);
    return codec ? codec[0].decode(codec[1], value) : value;
  }

  _datatype(field: Field){
    const codec = this._codec(field);
    return codec ? codec[0].datatype(codec[1]) : field.type;
  }

  /**
   * Gate changes to a class's rows on this connection, returning a remover.
   *
   * Runs only where the class is bound to this connection - a client binding the same class elsewhere never runs it.
   * Each registration runs, in order; with any registered, a delete by id selects its row first.
   *
   * @example
   * db.before(Upload, {
   *   delete(row){
   *     if (row.locked)
   *       throw new Error("Upload is locked.");
   *   }
   * });
   */
  before<T extends Type>(type: Type.Class<T>, hooks: Connection.Before<T>): () => boolean {
    return this._hook(type, "before", hooks);
  }

  /**
   * Run host-side effects after changes to a class's rows on this connection, returning a remover.
   *
   * Runs only where the class is bound to this connection - a client binding the same class elsewhere never runs it.
   * Each registration runs; with any registered, a delete by id selects its row first.
   *
   * @example
   * db.after(Upload, {
   *   async delete(row){
   *     await bucket.delete(row.path);
   *   }
   * });
   */
  after<T extends Type>(type: Type.Class<T>, hooks: Connection.After<T>): () => boolean {
    return this._hook(type, "after", hooks);
  }

  _hook(type: Type.Class, phase: keyof Hooks, hooks: object){
    const { ref } = type;
    const entry = { type, hooks };
    let table = this._hooks.get(ref);

    if (!table)
      this._hooks.set(ref, table = { before: new Set(), after: new Set() });

    const set = table[phase];

    set.add(entry);

    if (!HOOKED.has(this)) {
      HOOKED.add(this);

      const remove = this.remove;

      Object.defineProperty(this, "remove", {
        configurable: true,
        value: async (table: string, id: Connection.Key) => {
          const hooked = this._hooks.get(table);
          const [first] = hooked ? [...hooked.before, ...hooked.after] : [];

          if (!first)
            return remove.call(this, table, id);

          const { before, after } = hooked!;
          const [raw] = await this.select(table, match(first.type.fields.get("id")!, id), 1);
          const decode = (type: Type.Class) => row(type.fields, raw) as Promise<Columns<Type>>;

          if (raw)
            for (const { type, hooks } of before)
              if (hooks.delete)
                await hooks.delete(await decode(type));

          const journal = this._journal();

          await remove.call(this, table, id);

          if (!raw)
            return;

          const run = () => Promise.all(Array.from(after, async ({ type, hooks }) => {
            try {
              await hooks.delete?.(await decode(type));
            }
            catch (error) {
              console.error(error);
            }
          }));

          if (journal)
            journal.done.push(run);
          else
            await run();
        }
      });
    }

    return () => set.delete(entry as any);
  }

  /**
   * Run `fn` in a transaction - commit when it resolves, roll back and rethrow when it throws.
   *
   * Every statement inside joins without a handle - statics, `Query`, instance writes. A nested call joins the open one.
   * Rollback restores entities changed inside and destroys those created; entities deleted inside are destroyed on commit.
   * Other statements on the connection wait until it ends, unless the driver pools.
   * Throws when the driver has no `transact`, or the runtime no `AsyncLocalStorage`.
   *
   * @example
   * await db.transaction(async () => {
   *   await Account.update(from, { balance: 0 });
   *   await Account.update(to, { balance: 100 });
   * });
   */
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (!this.transact)
      throw new Error(`${this.constructor.name} does not support transactions.`);

    const storage = scope();
    const outer = storage.getStore();

    if (outer?.has(this))
      return fn();

    const release = await this.lock();
    const journal: Connection.Journal = { undo: [], done: [] };
    let result: T;
    let effects: unknown[];

    try {
      result = await storage.run(new Map(outer).set(this, journal), () => this.transact!(async () => fn()));
      effects = journal.done.map(apply => apply());
    }
    catch (error) {
      journal.undo.reverse().forEach(apply => apply());
      throw error;
    }
    finally {
      release();
    }

    await Promise.all(effects);

    return result;
  }

  /**
   * Driver hook - run `fn` inside one transaction: begin, `fn`, then commit or roll back.
   *
   * Defining it enables `transaction`.
   */
  protected transact?<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Take the connection for a transaction, resolving a release function.
   *
   * Waits out the open one. A pooled driver overrides it.
   */
  protected async lock(){
    while (this._active)
      await this._active;

    let release!: () => void;

    this._active = new Promise(resolve => release = resolve);

    return () => {
      this._active = undefined;
      release();
    };
  }

  /**
   * Wait until no other transaction holds the connection - call before each statement.
   *
   * Returns at once inside the open one.
   */
  protected async idle(){
    while (this._active && !this._journal())
      await this._active;
  }

  /** Compile a `Query` builder into a statement. Without it a `Query` rejects when run. */
  prepare?(builder: Builder): Builder.Statement;

  /**
   * Report row changes so loaded entities follow them. Returns a stop function.
   *
   * Called when the first class loads.
   */
  subscribe?(listener: (change: Connection.Change) => void): () => void;

  /**
   * Check the schema against the bound classes, creating what is missing unless `fix` is false.
   *
   * Runs when first awaited.
   */
  sync?(fix?: boolean): Promise<unknown>;
}

export { ambient, Connection, forget };
