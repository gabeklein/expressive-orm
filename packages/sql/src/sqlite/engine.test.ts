import { Miniflare } from 'miniflare';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createEngine, host } from './engine';

const DRIVERS = ["bun:sqlite", "node:sqlite", "better-sqlite3", "sqlite3", "@libsql/client"];

function unavailable(...names: string[]){
  for (const name of names)
    vi.doMock(name, () => { throw new Error(`Cannot find module '${name}'`) });
}

class SyncDatabase {
  log: unknown[][] = [];

  constructor(public file: string){}

  prepare(sql: string){
    return {
      all: (...params: unknown[]) => (this.log.push(["all", sql, params]), [{ sql }]),
      get: (...params: unknown[]) => (this.log.push(["get", sql, params]), { sql }),
      run: (...params: unknown[]) => (this.log.push(["run", sql, params]), { changes: 2 })
    };
  }

  exec(sql: string){
    this.log.push(["exec", sql]);
  }

  close(){
    this.log.push(["close"]);
  }
}

afterEach(() => {
  for (const name of DRIVERS)
    vi.doUnmock(name);

  Reflect.deleteProperty(globalThis, "Bun");
});

describe("node:sqlite", () => {
  it("will run statements", async () => {
    const engine = await createEngine(":memory:");

    await engine.exec("CREATE TABLE foo (id INTEGER PRIMARY KEY, name TEXT)");

    expect(await engine.run("INSERT INTO foo (name) VALUES (?)", ["a"])).toEqual({ changes: 1 });
    expect(await engine.run("INSERT INTO foo (name) VALUES ('b')")).toEqual({ changes: 1 });
    expect(await engine.get("SELECT name FROM foo WHERE id = ?", [2])).toEqual({ name: "b" });
    expect(await engine.get("SELECT COUNT(*) AS n FROM foo")).toEqual({ n: 2 });
    expect(await engine.all("SELECT name FROM foo WHERE id > ?", [0])).toEqual([{ name: "a" }, { name: "b" }]);
    expect(await engine.all("SELECT id FROM foo")).toEqual([{ id: 1 }, { id: 2 }]);

    await engine.close();
  });
});

describe("bun:sqlite", () => {
  it("will be preferred under Bun", async () => {
    let db!: SyncDatabase;

    Object.assign(globalThis, { Bun: {} });
    vi.doMock("bun:sqlite", () => ({
      Database: class extends SyncDatabase {
        constructor(file: string){
          super(file);
          db = this;
        }
      }
    }));

    const engine = await createEngine("test.db");

    await engine.exec("SELECT 1");
    await engine.close();

    expect(db.file).toBe("test.db");
    expect(db.log).toEqual([["exec", "PRAGMA foreign_keys = ON"], ["exec", "SELECT 1"], ["close"]]);
  });
});

describe("better-sqlite3", () => {
  it("will follow node:sqlite", async () => {
    let db!: SyncDatabase;

    unavailable("node:sqlite");
    vi.doMock("better-sqlite3", () => ({
      default: class extends SyncDatabase {
        constructor(file: string){
          super(file);
          db = this;
        }
      }
    }));

    const engine = await createEngine("test.db");

    expect(await engine.all("SELECT ?", [1])).toEqual([{ sql: "SELECT ?" }]);
    expect(await engine.get("SELECT ?", [2])).toEqual({ sql: "SELECT ?" });
    expect(await engine.run("UPDATE ?", [3])).toEqual({ changes: 2 });

    expect(db.file).toBe("test.db");
    expect(db.log).toEqual([
      ["exec", "PRAGMA foreign_keys = ON"],
      ["all", "SELECT ?", [1]],
      ["get", "SELECT ?", [2]],
      ["run", "UPDATE ?", [3]]
    ]);
  });
});

describe("sqlite3", () => {
  class AsyncDatabase {
    static last: AsyncDatabase;

    error?: Error;
    log: unknown[][] = [];

    constructor(public file: string){
      AsyncDatabase.last = this;
    }

    respond(method: string, sql: string, params: unknown[], done: Function){
      this.log.push([method, sql, params]);
      done.call({ changes: 3 }, this.error, [{ sql }]);
    }

    all(sql: string, params: unknown[], done: Function){
      this.respond("all", sql, params, done);
    }

    get(sql: string, params: unknown[], done: Function){
      this.respond("get", sql, params, done);
    }

    run(sql: string, params: unknown[], done: Function){
      this.respond("run", sql, params, done);
    }

    exec(sql: string, done: Function){
      this.log.push(["exec", sql]);
      done(this.error);
    }

    close(done: Function){
      this.log.push(["close"]);
      done(this.error);
    }
  }

  async function load(){
    unavailable("node:sqlite", "better-sqlite3");
    vi.doMock("sqlite3", () => ({ default: { Database: AsyncDatabase } }));

    const engine = await createEngine("test.db");

    return { engine, db: AsyncDatabase.last };
  }

  it("will adapt callbacks", async () => {
    const { engine, db } = await load();

    expect(await engine.all("SELECT ?", [1])).toEqual([{ sql: "SELECT ?" }]);
    expect(await engine.get("SELECT 2")).toEqual([{ sql: "SELECT 2" }]);
    expect(await engine.run("UPDATE 3")).toEqual({ changes: 3 });

    await engine.exec("SELECT 4");
    await engine.close();

    expect(db.file).toBe("test.db");
    expect(db.log).toEqual([
      ["exec", "PRAGMA foreign_keys = ON"],
      ["all", "SELECT ?", [1]],
      ["get", "SELECT 2", []],
      ["run", "UPDATE 3", []],
      ["exec", "SELECT 4"],
      ["close"]
    ]);
  });

  it("will reject with a callback error", async () => {
    const { engine, db } = await load();
    const error = db.error = new Error("nope");

    await expect(engine.all("SELECT 1")).rejects.toBe(error);
    await expect(engine.exec("SELECT 1")).rejects.toBe(error);
    await expect(engine.close()).rejects.toBe(error);
  });
});

describe("@libsql/client", () => {
  async function load(file: string){
    const client = {
      url: "",
      log: [] as unknown[][],
      async execute(statement: unknown){
        this.log.push(["execute", statement]);
        return { rows: [{ a: 1 }, { a: 2 }], rowsAffected: 4n };
      },
      async executeMultiple(sql: string){
        this.log.push(["executeMultiple", sql]);
      },
      close(){
        this.log.push(["close"]);
      }
    };

    unavailable("node:sqlite", "better-sqlite3", "sqlite3");
    vi.doMock("@libsql/client", () => ({
      createClient: ({ url }: { url: string }) => Object.assign(client, { url })
    }));

    return { engine: await createEngine(file), client };
  }

  it("will open a file", async () => {
    const { client } = await load("test.db");

    expect(client.url).toBe("file:test.db");
  });

  it("will open a remote address first", async () => {
    const { client } = await load("libsql://db.example.test?authToken=token");

    expect(client.url).toBe("libsql://db.example.test?authToken=token");
    expect(client.log).toEqual([]);
  });

  it("will run statements", async () => {
    const { engine, client } = await load(":memory:");

    expect(await engine.all("SELECT ?", [1])).toEqual([{ a: 1 }, { a: 2 }]);
    expect(await engine.all("SELECT 5")).toEqual([{ a: 1 }, { a: 2 }]);
    expect(await engine.get("SELECT 2")).toEqual({ a: 1 });
    expect(await engine.run("UPDATE 3")).toEqual({ changes: 4 });

    await engine.exec("SELECT 4");
    await engine.close();

    expect(client.url).toBe(":memory:");
    expect(client.log).toEqual([
      ["executeMultiple", "PRAGMA foreign_keys = ON"],
      ["execute", { sql: "SELECT ?", args: [1] }],
      ["execute", { sql: "SELECT 5", args: [] }],
      ["execute", { sql: "SELECT 2", args: [] }],
      ["execute", { sql: "UPDATE 3", args: [] }],
      ["executeMultiple", "SELECT 4"],
      ["close"]
    ]);
  });
});

describe("d1", () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch: () => new Response() }",
    d1Databases: ["DB"]
  });

  let engine: ReturnType<typeof host>;

  beforeAll(async () => {
    engine = host(await mf.getD1Database("DB"));
  });

  afterAll(() => mf.dispose());

  it("will run statements", async () => {
    await engine.exec("CREATE TABLE foo (id INTEGER PRIMARY KEY, name TEXT)");

    expect(await engine.run("INSERT INTO foo (name) VALUES (?)", ["a"])).toEqual({ changes: 1 });
    expect(await engine.run("INSERT INTO foo (name) VALUES ('b')")).toEqual({ changes: 1 });
    expect(await engine.get("SELECT name FROM foo WHERE id = ?", [2])).toEqual({ name: "b" });
    expect(await engine.get("SELECT name FROM foo WHERE id = 3")).toBeUndefined();
    expect(await engine.all("SELECT name FROM foo WHERE id > ?", [0])).toEqual([{ name: "a" }, { name: "b" }]);
    expect(await engine.all("SELECT id FROM foo")).toEqual([{ id: 1 }, { id: 2 }]);

    await engine.close();
  });

  it("will batch atomically", async () => {
    await engine.exec("CREATE TABLE bar (id INTEGER PRIMARY KEY)");
    await expect(engine.batch!(["INSERT INTO bar VALUES (1)", "INSERT INTO nope VALUES (1)"])).rejects.toThrow("no such table: nope");

    expect(await engine.all("SELECT * FROM bar")).toEqual([]);

    await engine.batch!(["INSERT INTO bar VALUES (1)", "INSERT INTO bar VALUES (2)"]);

    expect(await engine.all("SELECT * FROM bar")).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("will enforce foreign keys", async () => {
    expect(await engine.get("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
  });

  it("will exec a statement over lines", async () => {
    await engine.exec("CREATE TABLE multi (\n  id INTEGER PRIMARY KEY\n)");

    expect(await engine.all("SELECT name FROM pragma_table_info('multi')")).toEqual([{ name: "id" }]);
  });

  it("will throw on transaction", async () => {
    await expect(engine.transaction!()).rejects.toThrow("D1 has no interactive transactions.");
  });
});

it("will use an engine as given", async () => {
  const engine = await createEngine(":memory:");

  expect(host(engine)).toBe(engine);

  await engine.close();
});

it("will throw if no driver is available", async () => {
  unavailable(...DRIVERS);

  await expect(createEngine(":memory:")).rejects.toThrow(
    "No compatible SQLite driver found. Run under Bun or Node >=24, " +
    "or install one of: better-sqlite3, sqlite3, @libsql/client."
  );
});
