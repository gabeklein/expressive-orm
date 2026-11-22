import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { str, Type } from '@expressive/orm';

import { sqlite } from './open';
import { SQLiteConnection } from './SQLiteConnection';

function folder(files: Record<string, string>){
  const dir = mkdtempSync(join(tmpdir(), "sqlite-"));

  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }

  return dir;
}

it("will open in memory with foreign keys on", async () => {
  const engine = await sqlite();

  expect(await engine.get("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
  expect(await engine.all("SELECT name FROM sqlite_master")).toEqual([]);

  await engine.close();
});

describe("migrations", () => {
  const files = {
    "migrations/0002_post.sql": "CREATE TABLE post (id INTEGER PRIMARY KEY, user INTEGER REFERENCES user(id));",
    "migrations/0001_user.sql": "CREATE TABLE user (id INTEGER PRIMARY KEY, name TEXT);",
    "migrations/notes.md": "not a migration",
    "seed.sql": "INSERT INTO user (name) VALUES ('ada');"
  };

  const options = (dir: string) => ({ migrations: join(dir, "migrations"), seed: join(dir, "seed.sql") });

  it("will apply migrations and seed a new file", async () => {
    const dir = folder(files);
    const engine = await sqlite(join(dir, "app.db"), options(dir));

    expect(await engine.all("SELECT name FROM _migrations ORDER BY name")).toEqual([{ name: "0001_user.sql" }, { name: "0002_post.sql" }]);
    expect(await engine.all("SELECT name FROM user")).toEqual([{ name: "ada" }]);

    await engine.close();
  });

  it("will apply only new migrations, and not seed again", async () => {
    const dir = folder(files);

    await (await sqlite(join(dir, "app.db"), options(dir))).close();
    writeFileSync(join(dir, "migrations/0003_tag.sql"), "CREATE TABLE tag (name TEXT);");

    const engine = await sqlite(join(dir, "app.db"), options(dir));

    expect(await engine.all("SELECT name FROM _migrations ORDER BY name")).toEqual([{ name: "0001_user.sql" }, { name: "0002_post.sql" }, { name: "0003_tag.sql" }]);
    expect(await engine.get("SELECT count(*) AS n FROM user")).toEqual({ n: 1 });

    await engine.close();
  });

  it("will seed without migrations", async () => {
    const dir = folder({ "seed.sql": "CREATE TABLE x (n INTEGER); INSERT INTO x VALUES (1);" });
    const engine = await sqlite(join(dir, "app.db"), { seed: join(dir, "seed.sql") });

    expect(await engine.get("SELECT n FROM x")).toEqual({ n: 1 });

    await engine.close();
  });

  it("will apply nothing and reject if a migration fails", async () => {
    const dir = folder({ ...files, "migrations/0003_bad.sql": "CREATE TABLE nope (;" });
    const file = join(dir, "app.db");

    await expect(sqlite(file, options(dir))).rejects.toThrow();

    const engine = await sqlite(file);

    expect(await engine.get("SELECT count(*) AS n FROM sqlite_master")).toEqual({ n: 0 });

    await engine.close();
  });
});

it("will serve a connection's session", async () => {
  class Note extends Type {
    text = str();
  }

  const engine = await sqlite();
  const db = SQLiteConnection.new([Note]);

  await engine.exec("CREATE TABLE note (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)");

  const text = await db.session(async () => {
    await Note.insert({ text: "hi" });
    const [note] = await Note.query();
    return note.text;
  }, engine);

  expect(text).toBe("hi");
  expect(await engine.get("SELECT text FROM note")).toEqual({ text: "hi" });

  await db.close();
  await engine.close();
});
