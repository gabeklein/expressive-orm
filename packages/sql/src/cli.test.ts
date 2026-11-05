import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memory, num, str, Type } from '@expressive/orm';

import sql from './cli';
import { createEngine } from './sqlite/engine';
import { SQLiteConnection } from './sqlite/SQLiteConnection';

let dir: string;
let lines: string[];

const out = {
  log: (line: string) => void lines.push(line),
  error: (line: string) => void lines.push(line)
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "expressive-cli-"));
  lines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true });
  delete (globalThis as { entry?: unknown }).entry;
});

function entry(create: () => unknown){
  const file = join(dir, `entry-${Math.random().toString(36).slice(2)}.mjs`);

  (globalThis as { entry?: unknown }).entry = create;
  writeFileSync(file, "await globalThis.entry();\n");

  return file;
}

async function database(ddl?: string){
  const file = join(dir, "app.db");

  if (ddl) {
    const db = await createEngine(file);

    await db.exec(ddl);
    await db.close();
  }

  return file;
}

describe("usage", () => {
  it.each([
    [[]],
    [["check"]],
    [["drop", "entry.ts"]],
    [["check", "--force", "entry.ts"]],
    [["sync", "a.ts", "b.ts"]]
  ])("will print usage for %j", async (args) => {
    expect(await sql(args, out)).toBe(2);
    expect(lines[0]).toMatch(/^Usage: expressive sql/);
  })

  it("will fail for an entry with no connection", async () => {
    const file = entry(() => {});

    expect(await sql(["check", file], out)).toBe(1);
    expect(lines).toEqual([`${file} created no connection.`]);
  })

  it("will fail for a connection that cannot plan", async () => {
    class Note extends Type {
      text = str();
    }

    const file = entry(async () => {
      Note.connection = memory();
      await Note.connection;
    });

    expect(await sql(["check", file], out)).toBe(1);
    expect(lines).toEqual(["Memory: cannot plan a sync"]);
  })
})

describe("check", () => {
  it("will list changes without making them", async () => {
    const file = await database();

    class Post extends Type {
      title = str();
    }

    const main = () => entry(() => SQLiteConnection.new([Post], file));

    expect(await sql(["check", main()], out)).toBe(1);
    expect(lines).toEqual(["SQLiteConnection: out of date", "  + create table post"]);

    lines = [];

    expect(await sql(["check", main()], out)).toBe(1);
  })

  it("will pass when up to date", async () => {
    const file = await database("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL)");

    class Post extends Type {
      title = str();
    }

    expect(await sql(["check", entry(() => SQLiteConnection.new([Post], file))], out)).toBe(0);
    expect(lines).toEqual(["SQLiteConnection: up to date"]);
  })

  it("will hint where --force rebuilds", async () => {
    const file = await database("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL, rank TEXT NOT NULL)");

    class Post extends Type {
      title = str();
      rank = num();
      email = str();
    }

    expect(await sql(["check", entry(() => SQLiteConnection.new([Post], file))], out)).toBe(1);
    expect(lines).toEqual([
      "SQLiteConnection: out of date",
      "  ! Column rank in table post has type TEXT, expected INTEGER (sync --force rebuilds it)",
      "  ! Column email in table post is NOT NULL without a default and cannot be added to existing rows."
    ]);
  })
})

describe("sync", () => {
  it("will apply changes", async () => {
    const file = await database();

    class Post extends Type {
      title = str();
    }

    const main = () => entry(() => SQLiteConnection.new([Post], file));

    expect(await sql(["sync", main()], out)).toBe(0);
    expect(lines).toEqual(["SQLiteConnection: synced", "  + create table post"]);

    lines = [];

    expect(await sql(["sync", main()], out)).toBe(0);
    expect(lines).toEqual(["SQLiteConnection: up to date"]);
  })

  it("will change nothing when blocked", async () => {
    const file = await database("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL)");

    class Post extends Type {
      rank = num();
    }

    expect(await sql(["sync", entry(() => SQLiteConnection.new([Post], file))], out)).toBe(1);
    expect(lines).toEqual([
      "SQLiteConnection: not synced",
      "  ! Column rank in table post has type TEXT, expected INTEGER (sync --force rebuilds it)"
    ]);
  })

  it("will rebuild with --force", async () => {
    const file = await database("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL); INSERT INTO post (rank) VALUES ('x')");

    class Post extends Type {
      rank = num();
    }

    const main = () => entry(() => SQLiteConnection.new([Post], file));

    expect(await sql(["sync", "--force", main()], out)).toBe(1);
    expect(lines).toEqual([
      "SQLiteConnection: not synced",
      "  ! Column rank in table post cannot be rebuilt: 1 row is not INTEGER."
    ]);

    await database("UPDATE post SET rank = '3'");
    lines = [];

    expect(await sql(["sync", main(), "--force"], out)).toBe(0);
    expect(lines).toEqual(["SQLiteConnection: synced", "  + rebuild table post"]);
  })
})
