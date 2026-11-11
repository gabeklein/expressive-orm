import { missing, optional } from './load';

/**
 * A SQLite host - what `SQLiteConnection` runs statements on.
 *
 * Pass one in place of a filename for a SQLite the built-in loader cannot open.
 * It is used as given - foreign keys are not switched on, and the connection's `close()` leaves it open.
 */
export interface Engine extends Engine.Statements {
  /** Release the database. Called only on an engine the connection opened. */
  close(): Promise<void>;
  /**
   * Open a transaction on its own session.
   *
   * Without it the connection issues `BEGIN`, `COMMIT` and `ROLLBACK` through `exec`.
   */
  transaction?(): Promise<Engine.Session>;
  /**
   * Run statements atomically.
   *
   * `sync` applies through it when present; a table rebuild then needs foreign keys off.
   */
  batch?(sql: string[]): Promise<void>;
}

export declare namespace Engine {
  /** Statement methods an engine and a session share. Parameters are positional. */
  interface Statements {
    /** Run a statement, resolving every row. */
    all(sql: string, params?: any[]): Promise<any[]>;
    /** Run a statement, resolving the first row. */
    get(sql: string, params?: any[]): Promise<any>;
    /** Run a statement, resolving how many rows changed. */
    run(sql: string, params?: any[]): Promise<{ changes: number }>;
    /** Run one or more statements without parameters. */
    exec(sql: string): Promise<void>;
  }

  /** A transaction's own handle - statements inside `db.transaction(fn)` run on it. */
  interface Session extends Statements {
    commit(): Promise<void>;
    rollback(): Promise<void>;
  }
}

const DRIVERS = [bunSqlite, nodeSqlite, betterSqlite3, sqlite3, libsql];

const REMOTE = /^(libsql|https?|wss?):\/\//;

export async function createEngine(filename: string): Promise<Engine> {
  if (REMOTE.test(filename))
    return libsql(filename, filename);

  for (const load of DRIVERS) {
    const engine = await load(filename).catch(() => null);

    if (engine) {
      await engine.exec("PRAGMA foreign_keys = ON");
      return engine;
    }
  }

  throw new Error(missing);
}

async function bunSqlite(file: string): Promise<Engine | null> {
  if (typeof (globalThis as any).Bun === "undefined")
    return null;

  const { Database } = await optional("bun:sqlite");

  return syncEngine(new Database(file));
}

async function nodeSqlite(file: string): Promise<Engine | null> {
  const { DatabaseSync } = await optional("node:sqlite");

  return syncEngine(new DatabaseSync(file));
}

async function betterSqlite3(file: string): Promise<Engine | null> {
  const { default: Database } = await optional("better-sqlite3");

  return syncEngine(new Database(file));
}

async function sqlite3(file: string): Promise<Engine | null> {
  const { default: { Database } } = await optional("sqlite3");

  return asyncEngine(new Database(file));
}

async function libsql(file: string, url = file === ":memory:" ? file : `file:${file}`): Promise<Engine> {
  const { createClient } = await optional("@libsql/client");

  return libsqlEngine(createClient({ url }));
}

function syncEngine(db: any): Engine {
  return {
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      return { changes: db.prepare(sql).run(...params).changes };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
    }
  };
}

function asyncEngine(db: any): Engine {
  const call = (method: string, sql: string, params: any[]) =>
    new Promise<any>((resolve, reject) => {
      db[method](sql, params, function (this: any, err: any, rows: any) {
        if (err) reject(err);
        else resolve(method === "run" ? this : rows);
      });
    });

  const done = (resolve: () => void, reject: (err: any) => void) =>
    (err: any) => err ? reject(err) : resolve();

  return {
    all: (sql, params = []) => call("all", sql, params),
    get: (sql, params = []) => call("get", sql, params),
    run: (sql, params = []) => call("run", sql, params).then(ctx => ({ changes: ctx.changes })),
    exec: sql => new Promise((resolve, reject) => db.exec(sql, done(resolve, reject))),
    close: () => new Promise((resolve, reject) => db.close(done(resolve, reject)))
  };
}

export function host(source: Engine | D1Database | LibSQLClient): Engine {
  const has = (key: string) => source && typeof source == "object" && key in source;

  if (has("all"))
    return source as Engine;

  if (has("execute"))
    return libsqlEngine(source as LibSQLClient);

  if (has("prepare") && has("batch"))
    return d1Engine(source as D1Database);

  throw new TypeError("Unknown SQLite source. Pass a filename, a libSQL address, a D1 binding, a libSQL client or an Engine.");
}

export const migrations = new WeakMap<Engine, (sql: string[]) => Promise<unknown>>();

/** A libSQL client from `@libsql/client` 0.18 or later - local, Turso or any libSQL server. */
export interface LibSQLClient extends LibSQLStatements {
  batch(sql: string[], mode: "write"): Promise<unknown>;
  migrate(sql: string[]): Promise<unknown>;
  transaction(mode: "write"): Promise<LibSQLStatements & { commit(): Promise<void>; rollback(): Promise<void> }>;
  close(): void;
}

interface LibSQLStatements {
  execute(statement: { sql: string, args: any[] }): Promise<{ rows: any[], rowsAffected: number }>;
  executeMultiple(sql: string): Promise<void>;
}

function libsqlEngine(client: LibSQLClient): Engine {
  const engine: Engine = {
    ...libsqlStatements(client),
    async batch(sql) {
      await client.batch(sql, "write");
    },
    async transaction() {
      const tx = await client.transaction("write");

      return {
        ...libsqlStatements(tx),
        commit: () => tx.commit(),
        rollback: () => tx.rollback()
      };
    },
    async close() {
      client.close();
    }
  };

  migrations.set(engine, sql => client.migrate(sql));

  return engine;
}

function libsqlStatements(client: LibSQLStatements): Engine.Statements {
  const execute = (sql: string, args: any[]) => client.execute({ sql, args });

  return {
    async all(sql, params = []) {
      return (await execute(sql, params)).rows;
    },
    async get(sql, params = []) {
      return (await execute(sql, params)).rows[0];
    },
    async run(sql, params = []) {
      return { changes: Number((await execute(sql, params)).rowsAffected) };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    }
  };
}

/** A Cloudflare D1 binding, such as a Worker's `env.DB`. */
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface D1Statement {
  bind(...values: any[]): D1Statement;
  all(): Promise<{ results: any[] }>;
  first(): Promise<any>;
  run(): Promise<{ meta: { changes: number } }>;
}

function d1Engine(db: D1Database): Engine {
  const statement = (sql: string, params: any[] = []) => db.prepare(sql).bind(...params);

  return {
    async all(sql, params) {
      return (await statement(sql, params).all()).results;
    },
    async get(sql, params) {
      return await statement(sql, params).first() ?? undefined;
    },
    async run(sql, params) {
      return { changes: (await statement(sql, params).run()).meta.changes };
    },
    async exec(sql) {
      await db.prepare(sql).run();
    },
    async batch(sql) {
      await db.batch(sql.map(sql => db.prepare(sql)));
    },
    async transaction(): Promise<never> {
      throw new Error("D1 has no interactive transactions.");
    },
    async close() {}
  };
}
