// Runtime-agnostic SQLite engine. The connection talks to this async interface;
// the concrete driver is picked at runtime from whatever is available, in order
// of preference, so the same package runs under Bun, Node >=24, or older Node
// (given an installed userland driver) without changing calling code.

export interface Engine {
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// Ordered candidates. Each returns an Engine when its driver is usable, or null
// to fall through to the next. The first that succeeds wins.
const DRIVERS: { name: string; load: (file: string) => Promise<Engine | null> }[] = [
  { name: "bun:sqlite", load: bunSqlite },
  { name: "node:sqlite", load: nodeSqlite },
  { name: "better-sqlite3", load: betterSqlite3 },
  { name: "sqlite3", load: sqlite3 },
  { name: "@libsql/client", load: libsql },
];

export async function createEngine(filename: string): Promise<Engine> {
  for (const driver of DRIVERS) {
    const engine = await driver.load(filename).catch(() => null);
    if (engine)
      return engine;
  }

  throw new Error(
    "No compatible SQLite driver found. Run under Bun or Node >=24, " +
    "or install one of: better-sqlite3, sqlite3, @libsql/client."
  );
}

// import() with a non-literal specifier stays a runtime import (never bundled)
// and is typed `any`, so optional/unshipped driver types never break the build.
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
  const mod = await optional("better-sqlite3");
  const Database = mod.default ?? mod;
  return syncEngine(new Database(file));
}

async function sqlite3(file: string): Promise<Engine | null> {
  const mod = await optional("sqlite3");
  const Database = (mod.default ?? mod).Database;
  return asyncEngine(new Database(file));
}

async function libsql(file: string): Promise<Engine | null> {
  const { createClient } = await optional("@libsql/client");
  const url = file === ":memory:" ? ":memory:" : `file:${file}`;
  return libsqlEngine(createClient({ url }));
}

// Adapter for synchronous, better-sqlite3-shaped drivers (bun:sqlite,
// node:sqlite, better-sqlite3): prepare(sql).{all,get,run}(...params) + exec.
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
    },
  };
}

// Adapter for node-sqlite3's callback API.
function asyncEngine(db: any): Engine {
  const call = (method: string, sql: string, params: any[]) =>
    new Promise<any>((resolve, reject) => {
      db[method](sql, params, function (this: any, err: any, rows: any) {
        if (err) reject(err);
        else resolve(method === "run" ? this : rows);
      });
    });

  return {
    all: (sql, params = []) => call("all", sql, params),
    get: (sql, params = []) => call("get", sql, params),
    run: (sql, params = []) => call("run", sql, params).then(ctx => ({ changes: ctx.changes })),
    exec: sql => new Promise((resolve, reject) =>
      db.exec(sql, (err: any) => err ? reject(err) : resolve())),
    close: () => new Promise((resolve, reject) =>
      db.close((err: any) => err ? reject(err) : resolve())),
  };
}

// Adapter for @libsql/client (Turso).
function libsqlEngine(client: any): Engine {
  return {
    async all(sql, params = []) {
      return (await client.execute({ sql, args: params })).rows;
    },
    async get(sql, params = []) {
      return (await client.execute({ sql, args: params })).rows[0];
    },
    async run(sql, params = []) {
      return { changes: Number((await client.execute({ sql, args: params })).rowsAffected) };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    async close() {
      client.close();
    },
  };
}
