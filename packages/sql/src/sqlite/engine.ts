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

export async function createEngine(filename: string): Promise<Engine> {
  for (const load of DRIVERS) {
    const engine = await load(filename).catch(() => null);

    if (engine) {
      await engine.exec("PRAGMA foreign_keys = ON");
      return engine;
    }
  }

  throw new Error(
    "No compatible SQLite driver found. Run under Bun or Node >=24, " +
    "or install one of: better-sqlite3, sqlite3, @libsql/client."
  );
}

function optional(name: string): Promise<any> {
  return import(name);
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

async function libsql(file: string): Promise<Engine | null> {
  const { createClient } = await optional("@libsql/client");
  const url = file === ":memory:" ? ":memory:" : `file:${file}`;

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

function libsqlEngine(client: any): Engine {
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
    },
    async close() {
      client.close();
    }
  };
}
