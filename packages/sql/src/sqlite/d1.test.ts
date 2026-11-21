import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

import { str, Type } from '@expressive/orm';

import { d1 } from './d1';
import { SQLiteConnection } from './SQLiteConnection';

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch: () => new Response() }",
  d1Databases: ["DB"]
});

afterAll(() => mf.dispose());

function folder(files: Record<string, string>){
  const dir = mkdtempSync(join(tmpdir(), "d1-"));

  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }

  return dir;
}

async function script(DB: d1.Binding){
  await DB.exec("CREATE TABLE foo (id INTEGER PRIMARY KEY, name TEXT, ok INTEGER)");

  const insert = DB.prepare("INSERT INTO foo (name, ok) VALUES (?, ?)");
  const select = DB.prepare("SELECT name, ok FROM foo WHERE id > ?");
  const meta = ({ results, meta: { changes, last_row_id } }: d1.Result) => ({ results, changes, last_row_id });

  return [
    meta(await insert.bind("a", true).run()),
    meta(await insert.bind("b", false).all()),
    meta(await DB.prepare("INSERT INTO foo (name) VALUES ('c') RETURNING id").all()),
    meta(await select.bind(0).all()),
    await select.bind(0).first(),
    await select.bind(0).first("name"),
    await select.bind(9).first(),
    await select.bind(0).raw(),
    await select.bind(0).raw({ columnNames: true }),
    meta(await DB.prepare("UPDATE foo SET ok = 1").run()),
    (await DB.batch([insert.bind("d", 1), select.bind(3)])).map(meta),
    await DB.batch([insert.bind("e", 1), DB.prepare("INSERT INTO nope VALUES (1)")]).catch(() => "rejected"),
    await select.bind(4).raw()
  ];
}

it("will answer as D1 does", async () => {
  const real = await script(await mf.getD1Database("DB") as any);
  const local = await script(d1());

  expect(local).toEqual(real);
  expect(local).toMatchInlineSnapshot(`
    [
      {
        "changes": 1,
        "last_row_id": 1,
        "results": [],
      },
      {
        "changes": 1,
        "last_row_id": 2,
        "results": [],
      },
      {
        "changes": 1,
        "last_row_id": 3,
        "results": [
          {
            "id": 3,
          },
        ],
      },
      {
        "changes": 0,
        "last_row_id": 3,
        "results": [
          {
            "name": "a",
            "ok": 1,
          },
          {
            "name": "b",
            "ok": 0,
          },
          {
            "name": "c",
            "ok": null,
          },
        ],
      },
      {
        "name": "a",
        "ok": 1,
      },
      "a",
      null,
      [
        [
          "a",
          1,
        ],
        [
          "b",
          0,
        ],
        [
          "c",
          null,
        ],
      ],
      [
        [
          "name",
          "ok",
        ],
        [
          "a",
          1,
        ],
        [
          "b",
          0,
        ],
        [
          "c",
          null,
        ],
      ],
      {
        "changes": 3,
        "last_row_id": 3,
        "results": [],
      },
      [
        {
          "changes": 1,
          "last_row_id": 4,
          "results": [],
        },
        {
          "changes": 0,
          "last_row_id": 4,
          "results": [
            {
              "name": "d",
              "ok": 1,
            },
          ],
        },
      ],
      "rejected",
      [],
    ]
  `);
});

it("will exec statements over lines", async () => {
  const DB = d1();

  expect(await DB.exec("CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER);\n")).toEqual({ count: 2, duration: 0 });
  expect(await DB.prepare("SELECT name FROM sqlite_master ORDER BY name").raw()).toEqual([["a"], ["b"]]);
  expect(await DB.prepare("SELECT id FROM a").raw({ columnNames: true })).toEqual([]);
});

it("will enforce foreign keys", async () => {
  expect(await d1().prepare("PRAGMA foreign_keys").first("foreign_keys")).toBe(1);
});

it("will run statements one at a time", async () => {
  const DB = d1();

  await DB.exec("CREATE TABLE foo (id INTEGER PRIMARY KEY)");

  const results = await Promise.all([
    DB.batch([DB.prepare("INSERT INTO foo VALUES (1)"), DB.prepare("INSERT INTO foo VALUES (2)")]),
    DB.prepare("INSERT INTO foo VALUES (3)").run(),
    DB.prepare("INSERT INTO nope VALUES (1)").run().catch(() => "rejected"),
    DB.prepare("SELECT count(*) AS n FROM foo").first("n")
  ]);

  expect(results.slice(1)).toEqual([expect.objectContaining({ meta: expect.objectContaining({ changes: 1 }) }), "rejected", 3]);
});

describe("migrations", () => {
  const files = {
    "migrations/0002_post.sql": "CREATE TABLE post (id INTEGER PRIMARY KEY, user INTEGER REFERENCES user(id));",
    "migrations/0001_user.sql": "CREATE TABLE user (id INTEGER PRIMARY KEY, name TEXT);",
    "migrations/notes.md": "not a migration",
    "seed.sql": "INSERT INTO user (name) VALUES ('ada');"
  };

  it("will apply migrations and seed a new file", async () => {
    const dir = folder(files);
    const DB = d1(join(dir, "app.db"), { migrations: join(dir, "migrations"), seed: join(dir, "seed.sql") });

    expect(await DB.prepare("SELECT name FROM d1_migrations ORDER BY id").raw()).toEqual([["0001_user.sql"], ["0002_post.sql"]]);
    expect(await DB.prepare("SELECT name FROM user").raw()).toEqual([["ada"]]);
  });

  it("will apply only new migrations, and not seed again", async () => {
    const dir = folder(files);
    const options = { migrations: join(dir, "migrations"), seed: join(dir, "seed.sql") };

    await d1(join(dir, "app.db"), options).prepare("SELECT 1").run();
    writeFileSync(join(dir, "migrations/0003_tag.sql"), "CREATE TABLE tag (name TEXT);");

    const DB = d1(join(dir, "app.db"), options);

    expect(await DB.prepare("SELECT name FROM d1_migrations ORDER BY id").raw()).toEqual([["0001_user.sql"], ["0002_post.sql"], ["0003_tag.sql"]]);
    expect(await DB.prepare("SELECT count(*) FROM user").raw()).toEqual([[1]]);
  });

  it("will seed without migrations", async () => {
    const dir = folder({ "seed.sql": "CREATE TABLE x (n INTEGER); INSERT INTO x VALUES (1);" });

    expect(await d1(join(dir, "app.db"), { seed: join(dir, "seed.sql") }).prepare("SELECT n FROM x").first("n")).toBe(1);
  });

  it("will apply nothing if a migration fails", async () => {
    const dir = folder({ ...files, "migrations/0003_bad.sql": "CREATE TABLE nope (;" });
    const file = join(dir, "app.db");

    await expect(d1(file, { migrations: join(dir, "migrations"), seed: join(dir, "seed.sql") }).prepare("SELECT 1").run()).rejects.toThrow();
    expect(await d1(file).prepare("SELECT count(*) AS n FROM sqlite_master").first("n")).toBe(0);
  });
});

it("will serve a connection's session", async () => {
  class Note extends Type {
    text = str();
  }

  const DB = d1();
  const db = SQLiteConnection.new([Note]);

  await DB.exec("CREATE TABLE note (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)");

  const text = await db.session(async () => {
    await Note.insert({ text: "hi" });
    const [note] = await Note.query();
    return note.text;
  }, DB);

  expect(text).toBe("hi");
  expect(await DB.prepare("SELECT text FROM note").first("text")).toBe("hi");

  await db.close();
});
