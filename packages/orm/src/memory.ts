import { Connection } from './Connection';
import { Field, identify, match as constraints } from './Field';
import type { Builder } from './query/Builder';
import { evaluate, match, NULL, sort } from './query/evaluate';
import type { Query } from './query/Query';
import type { Type } from './Type';
import { fileAdapter, indexedDBAdapter } from './persist';

type Row = evaluate.Row;

type Table = memory.Table;

declare namespace memory {
  /** One table as an adapter stores it. */
  interface Table {
    /** Every row, keyed by column. */
    rows: Row[];
    /** The id the next insert takes. */
    next: number;
  }

  /** Tables by name. */
  type Snapshot = Record<string, Table>;

  /** Where a persisted `memory()` loads from and saves to. */
  interface Adapter {
    /**
     * Returns every stored table, or nothing for an empty store.
     *
     * Runs once, when the connection is created. Every statement waits for it; if it throws, every statement rejects with its error.
     */
    load(): Snapshot | undefined | Promise<Snapshot | undefined>;
    /**
     * Stores the tables that changed since the last save, as copies.
     *
     * Called a macrotask after a write, once per batch, one call at a time, and only for committed transactions.
     * A failed save logs to `console.error` and retries with the next write; `close()` rethrows it.
     */
    save(changes: Snapshot): void | Promise<void>;
  }

  interface Options {
    /** Loads tables when the connection opens and saves them as they change. */
    persist?: Adapter;
  }
}

function key(type: Query.Table) {
  return type.fields.get("id")!;
}

function matches(primary: Field, id: unknown) {
  const where = constraints(primary, id);

  return (row: Row) => where.every(([column, , value]) => row[column] === value);
}

class Memory extends Connection {
  _tables = new Map<string, Table>();
  _listeners = new Set<(change: Connection.Change) => void>();
  _persist?: memory.Adapter;
  _ready?: Promise<void>;
  _saving?: Promise<void>;
  _dirty = new Set<string>();

  _table(name: string) {
    let table = this._tables.get(name);

    if (!table)
      this._tables.set(name, table = { rows: [], next: 1 });

    return table;
  }

  _key(name: string) {
    for (const type of [...this.using, ...this._loaded.keys()])
      if ((type.schema ? `${type.schema}.${type.table}` : type.table) === name)
        return key(type);

    return new Field("id");
  }

  async _load(adapter: memory.Adapter) {
    const snapshot = await adapter.load();

    for (const name in snapshot) {
      const { rows, next } = snapshot[name];
      this._tables.set(name, { rows: rows.map(row => ({ ...row })), next });
    }

    this._persist = adapter;
  }

  _flush() {
    return this._saving ||= this._write();
  }

  async _write() {
    try {
      while (this._dirty.size) {
        await new Promise(resolve => setTimeout(resolve));

        const release = await this.lock();
        const changes: memory.Snapshot = {};

        for (const name of this._dirty) {
          const { rows, next } = this._table(name);
          changes[name] = { rows: rows.map(row => ({ ...row })), next };
        }

        this._dirty.clear();
        release();

        try {
          await this._persist!.save(changes);
        }
        catch (error) {
          for (const name in changes)
            this._dirty.add(name);

          throw error;
        }
      }
    }
    finally {
      this._saving = undefined;
    }
  }

  async close() {
    if (this._persist && this._journal())
      throw new Error("Cannot close a connection inside its own transaction.");

    try {
      await this._ready?.catch(() => {});

      if (this._persist) {
        (await this.lock())();
        await this._flush();
      }
    }
    finally {
      await super.close();
    }
  }

  protected async idle() {
    await this._ready;
    await super.idle();
  }

  _notify(table: string, op: Connection.Change["op"], id: Connection.Key, row?: Row) {
    const change: Connection.Change = row ? { table, op, id, row: { ...row } } : { table, op, id };
    const emit = () => {
      if (this._persist) {
        this._dirty.add(table);
        this._flush().catch(error => console.error(error));
      }

      this._listeners.forEach(listener => listener(change));
    };
    const journal = this._journal();

    if (journal)
      journal.done.push(emit);
    else
      emit();
  }

  _add(name: string, data: Row, primary = this._key(name)) {
    const into = this._table(name);
    const row = primary.parts ? structuredClone(data) : { [primary.column]: into.next, ...structuredClone(data) };
    const id = identify(primary, row);

    if (typeof id == "number")
      into.next = Math.max(into.next, id + 1);

    into.rows.push(row);
    this._notify(name, "insert", id, row);

    return row;
  }

  async select(name: string, constraints: Type.Constraint[], limit?: number, offset = 0) {
    await this.idle();

    const order: [(row: Row) => unknown, number][] = [];
    let rows = this._table(name).rows;

    for (const [field, op, value] of constraints) {
      if (op === 'asc' || op === 'desc') {
        order.push([row => row[field], op === 'asc' ? 1 : -1]);
        continue;
      }

      const test = NULL[op];

      rows = test
        ? rows.filter(row => test(row[field]))
        : rows.filter(row => match(op, row[field], value));
    }

    return sort(rows, order)
      .slice(offset, limit ? offset + limit : undefined)
      .map(row => structuredClone(row));
  }

  async insert(name: string, data: Row, returns?: boolean, conflict?: Connection.Conflict) {
    await this.idle();

    const existing = conflict && this._table(name).rows.find(row => (
      conflict.on.every(column => row[column] === data[column])
    ));

    let row = existing;

    if (!existing)
      row = this._add(name, data);
    else if (conflict!.update) {
      const assign: Row = { ...conflict!.set };

      for (const column of conflict!.update)
        assign[column] = data[column] ?? null;

      Object.assign(existing, assign);
      this._notify(name, "update", identify(this._key(name), existing), assign);
    }
    else
      return;

    if (returns)
      return structuredClone(row);
  }

  async update(name: string, id: Connection.Key, data: Row) {
    await this.idle();

    const test = matches(this._key(name), id);

    for (const row of this._table(name).rows)
      if (test(row)) {
        Object.assign(row, structuredClone(data));
        this._notify(name, "update", id, data);
      }
  }

  async remove(name: string, id: Connection.Key) {
    await this.idle();

    const test = matches(this._key(name), id);
    const into = this._table(name);

    into.rows = into.rows.filter(row => !test(row));
    this._notify(name, "delete", id);
  }

  subscribe(listener: (change: Connection.Change) => void) {
    this._listeners.add(listener);

    return () => {
      this._listeners.delete(listener);
    };
  }

  _store: evaluate.Store = {
    rows: table => this._table(table.name).rows,
    insert: (table, row) => this._add(table.name, row, key(table.type)),
    update: (table, row, assign) => {
      Object.assign(row, assign);
      this._notify(table.name, "update", identify(key(table.type), row), assign);
    },
    delete: (table, rows) => {
      const store = this._table(table.name);
      const removed = new Set(rows);

      store.rows = store.rows.filter(row => !removed.has(row));
      rows.forEach(row => this._notify(table.name, "delete", identify(key(table.type), row)));
    }
  };

  prepare(query: Builder): Builder.Statement {
    const run = async (params?: unknown[]) => {
      await this.idle();
      return evaluate(this._store, query, params!);
    };

    return {
      all: async (params) => (await run(params)).rows!,
      run: async (params) => (await run(params)).count,
      toString: () => String(query)
    };
  }

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    await this._ready;

    const saved = new Map(Array.from(this._tables, ([name, { rows, next }]) => (
      [name, { rows: rows.map(row => ({ ...row })), next }]
    )));

    try {
      return await fn();
    }
    catch (error) {
      this._tables = saved;
      throw error;
    }
  }
}

/**
 * An in-memory connection - rows in arrays, for tests, prototypes, and with `persist`, small apps.
 *
 * Runs `Query` except raw SQL templates, supports `transaction`, and reports every write to live rows.
 * `isLike` is case-sensitive, unlike SQLite's.
 * With `persist`, tables load when the connection opens and save as they change; `close()` waits for the last save and throws if it failed.
 *
 * @example
 * class User extends Type {
 *   static connection = memory({ persist: memory.indexedDB("app") });
 *   name = str();
 * }
 */
function memory(options: memory.Options = {}): Connection {
  const db = Memory.new();

  if (options.persist) {
    db._ready = db._load(options.persist);
    db._ready.catch(() => {});
  }

  return db;
}

memory.indexedDB = indexedDBAdapter;
memory.file = fileAdapter;

export { memory };
