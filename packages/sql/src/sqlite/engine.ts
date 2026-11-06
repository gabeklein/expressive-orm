export interface Engine extends Engine.Statements {
  close(): Promise<void>;
  transaction?(): Promise<Engine.Session>;
  batch?(sql: string[]): Promise<void>;
}

export declare namespace Engine {
  interface Statements {
    all(sql: string, params?: any[]): Promise<any[]>;
    get(sql: string, params?: any[]): Promise<any>;
    run(sql: string, params?: any[]): Promise<{ changes: number }>;
    exec(sql: string): Promise<void>;
  }

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

export function libsqlEngine(client: any): Engine {
  return {
    ...libsqlStatements(client),
    async batch(sql) {
      await client.batch(sql, "write");
    },
    async close() {
      client.close();
    },
    ...client.protocol !== "file" && {
      async transaction() {
        const tx = await client.transaction("write");

        return {
          ...libsqlStatements(tx),
          commit: () => tx.commit(),
          rollback: () => tx.rollback()
        };
      }
    }
  };
}

function libsqlStatements(client: any): Engine.Statements {
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

type D1Database = {
  prepare(sql: string): { bind(...values: any[]): any };
  exec(sql: string): Promise<unknown>;
  batch(statements: any[]): Promise<unknown>;
};

export function d1Engine(db: D1Database): Engine {
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
      await db.exec(sql);
    },
    async batch(sql) {
      await db.batch(sql.map(sql => db.prepare(sql)));
    },
    async transaction(): Promise<never> {
      throw new Error("D1 has no interactive transactions. Use the D1 binding's batch() for atomic writes.");
    },
    async close() {}
  };
}

type ExpoDatabase = {
  getAllAsync(sql: string, params: any[]): Promise<any[]>;
  getFirstAsync(sql: string, params: any[]): Promise<any>;
  runAsync(sql: string, params: any[]): Promise<{ changes: number }>;
  execAsync(sql: string): Promise<void>;
  closeAsync(): Promise<void>;
};

export function expoEngine(db: ExpoDatabase): Engine {
  return {
    async all(sql, params = []) {
      return db.getAllAsync(sql, params);
    },
    async get(sql, params = []) {
      return await db.getFirstAsync(sql, params) ?? undefined;
    },
    async run(sql, params = []) {
      return { changes: (await db.runAsync(sql, params)).changes };
    },
    exec: sql => db.execAsync(sql),
    close: () => db.closeAsync()
  };
}
