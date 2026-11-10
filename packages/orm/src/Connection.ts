import { Model } from '@expressive/mvc';

import type { Builder } from './query/Builder';
import type { Query } from './query/Query';
import type { Type } from './Type';

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
    /** Deferred effects - run on commit. */
    done: (() => void)[];
    /** The driver's own handle for the transaction's statements. */
    session?: unknown;
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

const synced = new WeakMap<Connection, Promise<unknown>>();
const COLLECT = Symbol.for("@expressive/orm.collect");

let context: import('node:async_hooks').AsyncLocalStorage<Scope> | undefined;

function scope(){
  const hooks: typeof import('node:async_hooks') | undefined =
    (globalThis as any).process?.getBuiltinModule?.("node:async_hooks");

  if (!hooks)
    throw new Error("Transactions need AsyncLocalStorage, which this runtime does not provide.");

  return context ||= new hooks.AsyncLocalStorage<Scope>();
}

/**
 * Base class of a driver - a Model binding entity classes to a store.
 *
 * Implement `select`, `insert`, `update` and `remove`. `prepare`, `subscribe`, `sync` and `transact` are optional capabilities.
 * Create with `Connection.new(types)` and await it. Holds the identity map of entities loaded through it.
 */
abstract class Connection extends Model {
  /** Entity classes bound at construction. */
  readonly using: ReadonlySet<Query.Table>;
  /** Set by a driver's `sync` once the schema is in place. */
  readonly ready: boolean = false;

  _active?: Promise<void>;
  _loaded = new Map<Type.Class, Map<unknown, Type>>();

  /**
   * Binds each class to this connection.
   *
   * Throws when a class already has one. Construct with `Connection.new`.
   */
  constructor(using: Connection.Types = []){
    super();

    this.using = new Set(Object.values(using).map(type => {
      if (type.hasOwnProperty('connection'))
        throw new Error(`Type ${type.name} already has assigned connection.`);

      type.connection = this;
      return type;
    }));

    this.get(null, () => {
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

    try {
      const result = await storage.run(new Map(outer).set(this, journal), () => this.transact!(async () => fn()));

      journal.done.forEach(apply => apply());

      return result;
    }
    catch (error) {
      journal.undo.reverse().forEach(apply => apply());
      throw error;
    }
    finally {
      release();
    }
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

export { Connection };
