import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine, host } from './engine';

const DRIVERS = ["bun:sqlite", "node:sqlite", "better-sqlite3", "sqlite3"];

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

it("will use an engine as given", async () => {
  const engine = await createEngine(":memory:");

  expect(host(engine)).toBe(engine);

  await engine.close();
});

it.each([
  ["an unknown object", {}],
  ["null", null]
])("will refuse %s as an engine", (_, source) => {
  expect(() => host(source)).toThrow("Unknown SQLite source - expected an Engine.");
});

it("will throw if no driver is available", async () => {
  unavailable(...DRIVERS);

  await expect(createEngine(":memory:")).rejects.toThrow(
    "No compatible SQLite driver found. Run under Bun or Node >=24, " +
    "or install one of: better-sqlite3, sqlite3."
  );
});

it("will ask for an engine under React Native", async () => {
  vi.resetModules();
  vi.doMock('./load', () => import('./load.native'));

  try {
    const { createEngine } = await import('./engine');

    await expect(createEngine("app.db")).rejects.toThrow(
      "SQLite does not load under React Native. Pass an Engine instead."
    );
  }
  finally {
    vi.doUnmock('./load');
    vi.resetModules();
  }
});
