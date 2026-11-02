export interface Engine {
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const DRIVERS = [bunSqlite, nodeSqlite, betterSqlite3, sqlite3, libsql];

export async function createEngine(filename: string): Promise<Engine> {
  for (const load of DRIVERS) {
    const engine = await load(filename).catch(() => null);

    if (engine)
      return engine;
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
