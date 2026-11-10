import { Model } from '@expressive/mvc';

import type { Builder } from './query/Builder';
import type { Query } from './query/Query';
import { match, row } from './Field';
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

  /** Host-side effects for a class's rows - registered with `on`. */
  interface Hooks<T extends Type = Type> {
    /**
     * Runs after a row is deleted by id, receiving it as `find` resolves it - best effort.
     *
     * Covers instance `delete()`, static `delete(id)` and `remove` called directly; a delete by filter skips it.
     * Awaited before the delete resolves - inside a transaction, after commit and before `transaction` resolves, never after a rollback.
     * A throw or rejection is logged with `console.error`, never rejecting the delete.
     */
    delete?(row: Columns<T>): void | Promise<void>;
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
const HOOKED = new WeakSet<Connection>();
const COLLECT = Symbol.for("@expressive/orm.collect");

let storage: Promise<import('node:async_hooks').AsyncLocalStorage<Scope>> | undefined;
let context: import('node:async_hooks').AsyncLocalStorage<Scope> | undefined;

function hooks(name: string): Promise<typeof import('node:async_hooks')> {
  return import(name);
}

function scope(){
  return storage ||= hooks("node:async_hooks").then(
    ({ AsyncLocalStorage }) => context = new AsyncLocalStorage<Scope>(),
    () => {
      storage = undefined;
      throw new Error("Transactions need AsyncLocalStorage, which this runtime does not provide.");
    }
  );
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
  _hooks = new Map<string, Set<{ type: Type.Class; hooks: Connection.Hooks<any> }>>();

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
   * Register host-side effects for a class's rows on this connection, returning a remover.
   *
   * Effects run only where the class is bound to this connection - a client binding the same class elsewhere never runs them.
   * Each registration runs; with any registered, a delete by id selects its row first.
   *
   * @example
   * db.on(Upload, {
   *   async delete(row){
   *     await bucket.delete(row.path);
   *   }
   * });
   */
  on<T extends Type>(type: Type.Class<T>, hooks: Connection.Hooks<T>): () => boolean {
    const { ref } = type;
    const entry = { type, hooks };
    let set = this._hooks.get(ref);

    if (!set)
      this._hooks.set(ref, set = new Set());

    set.add(entry);

    if (!HOOKED.has(this)) {
      HOOKED.add(this);

      const remove = this.remove;

      Object.defineProperty(this, "remove", {
        configurable: true,
        value: async (table: string, id: Connection.Key) => {
          const hooked = this._hooks.get(table);

          if (!hooked?.size)
            return remove.call(this, table, id);

          const [{ type }] = hooked;
          const [raw] = await this.select(table, match(type.fields.get("id")!, id), 1);
          const journal = this._journal();

          await remove.call(this, table, id);

          if (!raw)
            return;

          const run = () => Promise.all(Array.from(hooked, async ({ type, hooks }) => {
            try {
              await hooks.delete?.(await row(type.fields, raw) as Columns<Type>);
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

    return () => set.delete(entry);
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

    const storage = await scope();
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

export { Connection };
