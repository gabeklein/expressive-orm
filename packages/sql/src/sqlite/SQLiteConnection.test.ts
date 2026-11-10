import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@libsql/client';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { asc, bool, date, desc, greaterThan, index, isIn, isLike, isNull, json, key, lessThan, notIn, notNull, now, num, one, orNull, Query, str, Type, uuid } from '@expressive/orm';
import { Builder } from '@expressive/orm/driver';

import { spy } from '../../test.setup';

import type { Connection } from '../connection/Connection';
import { createEngine, host, type Engine } from './engine';
import { SQLiteConnection } from './SQLiteConnection';
import { TestConnection } from './TestConnection';

describe("schema", () => {
  it("will create a table", async () => {
    class Users extends Type {
      name = str();
      email = str();
      age = num();
    }

    await TestConnection.new([ Users ]);

    const user = await Users.insert({
      name: "Gabe",
      email: "gabe@email.org",
      age: 25
    });

    expect(user.id).toBe(1);
  })

  it("will convert camelCase names to underscore", async () => {
    class FooBar extends Type {
      fooBar = bool();
    }

    const sql = TestConnection.new({ FooBar });

    expect(String(sql.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        foo_bar (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          foo_bar INTEGER NOT NULL
        );"
    `);
  });

  it("will render json as text and an unknown datatype as declared", async () => {
    class Doc extends Type {
      data = json<{ a: number }>();
      blob = json({ type: "blob" });
    }

    const sql = TestConnection.new({ Doc });

    expect(String(sql.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        doc (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          data TEXT NOT NULL,
          blob BLOB NOT NULL
        );"
    `);
  });

  it("will create FK constraints", async () => {
    class Foo extends Type {
      bar = one(Bar);
    }

    class Bar extends Type {
      value = num();
    }

    const sql = TestConnection.new({ Foo, Bar });

    expect(String(sql.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        foo (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          bar_id INTEGER NOT NULL REFERENCES bar (id)
        );

      CREATE TABLE
        bar (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          value INTEGER NOT NULL
        );"
    `);
  });

  it("will create FK actions", async () => {
    class Foo extends Type {
      bar = one(Bar, { onDelete: "CASCADE", onUpdate: "SET NULL" });
    }

    class Bar extends Type {}

    const sql = TestConnection.new({ Foo, Bar });

    expect(String(sql.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        foo (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          bar_id INTEGER NOT NULL REFERENCES bar (id) ON DELETE CASCADE ON UPDATE
          SET
            NULL
        );

      CREATE TABLE
        bar (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT);"
    `);
  });

  it("will create defaults and keys", async () => {
    class Foo extends Type {
      id = str({ primary: true });
      name = str({ fallback: "it's" });
      rank = num({ fallback: 3, unique: true });
      note = str({ nullable: true, fallback: null });
      created = date({ fallback: "NOW" });
    }

    const sql = TestConnection.new({ Foo });

    expect(String(sql.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        foo (
          id TEXT NOT NULL PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'it''s',
          rank INTEGER NOT NULL UNIQUE DEFAULT 3,
          note TEXT DEFAULT NULL,
          created TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );"
    `);
  });
});

describe("types", () => {
  it("will insert and retrieve a Bool", async () => {
    class Test extends Type {
      value1 = bool();
      value2 = bool({
        type: "text",
        either: ["YES", "NO"]
      });
    }

    const conn = await TestConnection.new([Test]);

    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        test (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          value1 INTEGER NOT NULL,
          value2 TEXT NOT NULL
        );"
    `);

    const insert = Query(where => {
      where(Test, { value1: true, value2: true });
    });

    expect(String(insert)).toMatchInlineSnapshot(`
      "INSERT INTO
        test (value1, value2)
      SELECT
        true,
        'YES'"
    `);

    await insert;

    const test = await Test.one();

    expect(test).toEqual({
      id: 1, value1: true, value2: true
    });

    const other = await Test.insert({ value1: false, value2: false });

    expect(await Test.one(other.id)).toMatchObject({ value1: false, value2: false });
  });

  it("will insert and retrieve a Date", async () => {
    class Test extends Type {
      date = date();
    }

    const conn = await TestConnection.new([ Test ]);

    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        test (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL
        );"
    `);

    const now = new Date();

    now.setMilliseconds(0);

    await Test.insert({ date: now })

    const value = await Test.query((foo, where) => {
      where(foo.id).equal(1);

      return foo.date;
    }).one(true);

    expect<Date>(value).toBeInstanceOf(Date);
    expect<Date>(value).toEqual(now);
  })
})

describe("select", () => {
  class Foo extends Type {
    bar = str();
    baz = str();
  }

  const db = TestConnection.new({ Foo }, async () => {
    await Foo.insert({ bar: "hello", baz: "world" });
  });

  it("will select via object", async () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
      return { bar, baz }
    })

    expect(await query).toEqual([
      { bar: "hello", baz: "world" }
    ]);
  })

  it("will output nested object", async () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);

      return {
        bar: { value: bar },
        baz: { value: baz }
      }
    })

    expect(await query).toEqual([{
      bar: { value: "hello" },
      baz: { value: "world" }
    }]);
  })

  it("will select a field directly", async () => {
    const query = Query(where => {
      const { bar } = where(Foo);
      return bar;
    })

    expect(await query).toEqual(["hello"]);
  })

  it("will select a entire entity", async () => {
    const query = Query(where => {
      return where(Foo);
    })

    const [foo] = await query;

    expect(foo).not.toBeInstanceOf(Foo);
    expect(foo).toEqual({ id: 1, bar: "hello", baz: "world" });
    expect(Object.isFrozen(foo)).toBe(true);
  })

  it("will count rows", async () => {
    await Foo.insert({ bar: "goodbye", baz: "world" });

    const all = Query(where => void where(Foo));
    const some = Query(where => {
      const foo = where(Foo);
      where(foo.bar).equal("goodbye");
    });

    expect(await all).toBe(2);
    expect(await some).toBe(1);
  })

  it("will alias a table joined twice", async () => {
    class User extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(User);
      editor = one(User, { column: "editor_id" });
    }

    await TestConnection.new([User, Post]);

    const a = await User.insert({ name: "A" });
    const b = await User.insert({ name: "B" });

    await Post.insert({ author: a.id, editor: b.id });

    const query = Query(where => {
      const post = where(Post);
      return { author: post.author.name, editor: post.editor.name };
    });

    expect(await query).toEqual([{ author: "A", editor: "B" }]);
  })

  it("will select without tables", async () => {
    const query = Query(where => {
      where.connection = db;

      return {
        foo: 5,
        bar: "hello",
      }
    });

    expect(await query).toEqual([{ foo: 5, bar: "hello" }]);
  })
})

describe("template", () => {
  class Foo extends Type {
    first = str();
    last = str();
    color = str();
  }

  TestConnection.new([Foo], async () => {
    await Query(where => {
      where(Foo,
        { first: "John", last: "Doe",   color: "red" },
        { first: "Jane", last: "Smith", color: "blue" }
      );
    });
  });

  it("will create a template", async () => {
    const template = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).equal(color);
      return foo.first;
    });

    const query = template("red");

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.first
      FROM
        foo
      WHERE
        foo.color = ?"
    `);

    expect(await query).toEqual(["John"]);
    expect(await template("blue")).toEqual(["Jane"]);
  })

  it("will preserve params order", async () => {
    const template = Query(where => (
      color: string, firstname: string
    ) => {
      const foo = where(Foo);

      where(foo.first).equal(firstname);
      where(foo.color).equal(color);

      return foo.last;
    });

    const query = template("red", "John");

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.last
      FROM
        foo
      WHERE
        foo.first = ?
        AND foo.color = ?"
    `);

    expect(await template("red", "John")).toEqual(["Doe"]);
    expect(await template("blue", "Jane")).toEqual(["Smith"]);
  })

  it("will select a parameter value", async () => {
    const conn = await TestConnection.new([]);
    const template = Query(where => {
      where.connection = conn;
      return (color: string) => color;
    });

    const query = template("red");

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        ?"
    `);

    expect(await template("red")).toEqual(["red"]);
  });

  it("will select a parameter in property", async () => {
    const conn = await TestConnection.new([]);
    const template = Query(where => {
      where.connection = conn;
      return (color: string) => ({ color })
    });

    const query = template("red");

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        ? AS "color""
    `);

    expect(await query).toEqual([{ color: "red" }]);
  });
})

describe("insert", () => {
  class Foo extends Type {
    name = str();
    color = str();
  }

  it("will insert a row of defaults", async () => {
    class Tick extends Type {
      note = str(orNull);
    }

    await TestConnection.new([Tick]);

    const first = await Tick.insert({});
    const second = await Tick.insert({});

    expect([first.id, second.id]).toEqual([1, 2]);
    await expect(Query(where => void where(Tick))).resolves.toBe(2);
  })

  it("will not insert defaults per joined row", async () => {
    class Tick extends Type {
      note = str(orNull);
    }

    await TestConnection.new([Foo, Tick]);
    await Foo.insert({ name: "a", color: "red" });

    const query = () => Query(where => {
      where(Foo);
      where(Tick, {});
    });

    expect(query).toThrow("Insert into tick for each joined row needs at least one value.");
  })

  it("will throw for bad value", async () => {
    const insert = () => Query(where => {
      // @ts-expect-error
      where(Foo, {
        name: "foobar",
        color: 3
      });
    });

    expect(insert).toThrowErrorMatchingInlineSnapshot(`
      [Error: Provided value for foo.color is not acceptable.
      Value must be a string.]
    `);
  })

  it("will throw for no value non-nullable", async () => {
    const insert = () => Query(where => {
      // @ts-expect-error
      where(Foo, { name: "foobar" });
    });

    expect(insert).toThrowErrorMatchingInlineSnapshot(
      `[Error: Can't assign to \`foo.color\`. A value is required but got undefined.]`);
  })

  it("will add index to specify error", async () => {
    const insert = () => Query(where => {
      // @ts-expect-error
      where(Foo,
        { name: "foo", color: "red" },
        { name: "bar" }
      );
    });

    expect(insert).toThrowErrorMatchingInlineSnapshot(`
      [Error: A provided value at \`color\` at index [1] is not acceptable.
      Can't assign to \`foo.color\`. A value is required but got undefined.]
    `);
  })

  it("will insert procedurally generated rows", async () => {
    class Users extends Type {
      name = str();
      email = str();
      age = num();
    }

    await TestConnection.new([Users]);

    const names = ["john", "jane", "bob", "alice"];
    const insert = Query(where => {
      where(Users, ...names.map((name, i) => ({
        name,
        age: i + 25,
        email: `${name.toLowerCase()}@email.org`
      })));
    });

    expect(String(insert)).toMatchInlineSnapshot(`
      "WITH
        input AS (
          SELECT
            value ->> 0 name,
            value ->> 1 email,
            value ->> 2 age
          FROM
            JSON_EACH(?)
        )
      INSERT INTO
        users (name, email, age)
      SELECT
        input.name,
        input.email,
        input.age
      FROM
        input"
    `);

    await insert;

    const results = await Users.query();

    expect(results).toEqual([
      { "id": 1, "name": "john",  "email": "john@email.org",  "age": 25 },
      { "id": 2, "name": "jane",  "email": "jane@email.org",  "age": 26 },
      { "id": 3, "name": "bob",   "email": "bob@email.org",   "age": 27 },
      { "id": 4, "name": "alice", "email": "alice@email.org", "age": 28 }
    ]);
  })
});

it("will update from data", async () => {
  class User extends Type {
    name = str();
    age = num();
  }

  interface Data {
    name: string;
    age: number;
  }

  const data: Data[] = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  await TestConnection.new([User]);

  await Query(where => {
    where(User,
      { name: "John", age: 0 },
      { name: "Jane", age: 0 },
      { name: "Joe", age: 0 },
    );
  });

  const query = Query(where => {
    const { name, age } = where(data);
    const user = where(User);

    where(user.name).equal(name);
    where(user).update({ age });
  });

  expect(String(query)).toMatchInlineSnapshot(`
    "WITH
      input AS (
        SELECT
          value ->> 0 name,
          value ->> 1 age
        FROM
          JSON_EACH(?)
      )
    UPDATE
      user
    SET
      age = input.age
    FROM
      input
    WHERE
      user.name = input.name"
  `)

  expect(await query).toBe(2);

  const results = await User.query();

  expect(results).toEqual([
    { id: 1, name: "John", age: 30 },
    { id: 2, name: "Jane", age: 25 },
    { id: 3, name: "Joe", age: 0 },
  ]);
})

describe("floor", () => {
  class Author extends Type {
    name = str();
  }

  class Post extends Type {
    author = one(Author);
    title = str();
    views = num({ fallback: 0 });
    draft = bool();
    published = date({ nullable: true });
  }

  it("will round trip entities", async () => {
    await TestConnection.new([Author, Post]);

    const gabe = await Author.insert({ name: "Gabe" });
    const first = await Post.insert({ author: gabe, title: "First", draft: false, published: new Date("2024-01-01T00:00:00Z") });
    const second = await Post.insert({ author: gabe.id, title: "Second", draft: true });

    expect(first).toEqual({ id: 1, author: 1, title: "First", views: 0, draft: false, published: new Date("2024-01-01T00:00:00Z") });
    expect(second).toEqual({ id: 2, author: 1, title: "Second", views: 0, draft: true, published: undefined });
    expect(Object.isFrozen(second)).toBe(true);

    const drafts = await Post.find({ draft: true });

    expect(drafts).toEqual([second]);

    const found = await Post.find({
      title: [isLike("%s%"), notNull()],
      views: greaterThan(-1),
      id: [isIn([1, 2]), asc()]
    }, 1, 1);

    expect(found).toEqual([second]);
    expect(await Post.find({ published: isNull() })).toEqual([second]);
    expect(await Post.find({ id: desc() }, undefined, 1)).toEqual([first]);
    expect(await Post.one(1)).toEqual(first);

    const post = await Post.get(2);

    await post.set({ title: "Second!", draft: false, views: 10 });

    const titles = await Post.query((post, where) => {
      where(post.views).over(5);

      return { title: post.title, author: post.author.name };
    });

    expect(titles).toEqual([{ title: "Second!", author: "Gabe" }]);

    await post.set({ published: new Date("2024-02-01T00:00:00Z") });

    const [reloaded] = await Post.query((post, where) => {
      where(post.id).equal(2);

      return { published: post.published, draft: post.draft };
    });

    expect(reloaded).toEqual({ published: new Date("2024-02-01T00:00:00Z"), draft: false });

    await Post.delete(first.id);

    expect(await Post.find()).toEqual([post.columns]);
    expect(await Post.one(1, false)).toBeUndefined();
  })

  it("will match an empty list", async () => {
    await TestConnection.new([Author]);

    const gabe = await Author.insert({ name: "Gabe" });

    expect(await Author.find({ id: isIn([]) })).toEqual([]);
    expect(await Author.find({ id: notIn([]) })).toEqual([gabe]);
  })

  it("will resolve a class bound by assignment", async () => {
    class User extends Type {
      name = str();
    }

    const db = await TestConnection.new([]);

    await (await (db as any).db()).exec("CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");

    User.connection = db;

    await expect(User.find()).resolves.toEqual([]);

    const user = await User.insert({ name: "Gabe" });

    await expect(User.find()).resolves.toEqual([user]);
    await User.delete(user.id);
    await expect(User.find()).resolves.toEqual([]);
  })

  it("will update by id", async () => {
    await TestConnection.new([Author]);

    const author = await Author.insert({ name: "Gabe" });

    await Author.update(author.id, { name: "Bob" });

    const [renamed] = await Query(where => where(Author).name);

    expect(renamed).toBe("Bob");
  })

  it("will settle a loaded entity on update by id", async () => {
    await TestConnection.new([Author]);

    const { id } = await Author.insert({ name: "Gabe" });
    const author = await Author.get(id);

    await expect(Author.update(id, { name: "Bob" })).resolves.toBeUndefined();

    expect(author.name).toBe("Bob");
  })

  it("will evict and destroy a loaded entity on delete by id", async () => {
    await TestConnection.new([Author]);

    const { id } = await Author.insert({ name: "Gabe" });
    const author = await Author.get(id);
    const destroyed = vi.fn();

    author.set(null, destroyed);
    await Author.delete(id);

    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(Author.loaded.has(id)).toBe(false);
    await expect(Author.find()).resolves.toEqual([]);
  })

  it("will create an entity with new", async () => {
    await TestConnection.new([Author, Post]);

    const gabe = await Author.new({ name: "Gabe" });
    const post = await Post.new({ author: gabe, title: "Hello", draft: false });

    expect(post.columns).toEqual({ id: 1, author: gabe.id, title: "Hello", views: 0, draft: false, published: undefined });
    expect(post.author).toBe(gabe);
    expect(Post.get(post.id)).toBe(post);

    await post.set({ title: "Bye", views: 2 });

    expect(post.title).toBe("Bye");
    await expect(Post.one(post.id)).resolves.toMatchObject({ title: "Bye", views: 2 });
  })

  it("will reject new on a constraint violation", async () => {
    class Tag extends Type {
      name = str({ unique: true });
    }

    await TestConnection.new([Tag]);
    await Tag.insert({ name: "a" });

    const didCatch = vi.fn();
    const release = Tag.on({ catch: didCatch });
    const tag = Tag.new({ name: "a" });

    try {
      await expect(tag).rejects.toThrow(/UNIQUE/);
    }
    finally {
      release();
    }

    expect(tag.get(null)).toBe(true);
    expect(didCatch).toHaveBeenCalledWith(expect.any(Error), "setup", undefined);
    await expect(Tag.find()).resolves.toHaveLength(1);
  })

  it("will close the engine", async () => {
    class Foo extends Type {}

    class Bar extends Type {}

    const db = SQLiteConnection.new([Foo]);
    const idle = SQLiteConnection.new([Bar]);

    await db;
    await db.close();
    await idle.close();

    expect(Foo.connection).not.toBe(db);
    expect(Bar.connection).not.toBe(idle);
  })
})

describe("renamed key column", () => {
  it("will round trip a numeric key", async () => {
    class User extends Type {
      id = num({ column: "user_id", primary: true });
      name = str();
    }

    const db = await TestConnection.new([User]);

    await expect(User.insert({ name: "Gabe" })).resolves.toEqual({ id: 1, name: "Gabe" });
    await expect(db.select("user", [])).resolves.toEqual([{ user_id: 1, name: "Gabe" }]);
    await expect(User.one(1)).resolves.toEqual({ id: 1, name: "Gabe" });

    const user = await User.get(1);

    await user.set({ name: "Bob" });
    await User.update(1, { name: "Ann" });
    await expect(db.select("user", [])).resolves.toEqual([{ user_id: 1, name: "Ann" }]);
    expect(user.name).toBe("Ann");

    await user.delete();
    await expect(db.select("user", [])).resolves.toEqual([]);
  })

  it("will round trip a string key", async () => {
    class Doc extends Type {
      id = uuid({ column: "doc_id", primary: true });
      title = str();
    }

    const db = await TestConnection.new([Doc]);
    await Doc.insert({ id: "a1", title: "Hello" });
    await expect(Doc.one("a1")).resolves.toEqual({ id: "a1", title: "Hello" });

    const doc = await Doc.get("a1");

    await doc.set({ title: "Bye" });
    await expect(db.select("doc", [])).resolves.toEqual([{ doc_id: "a1", title: "Bye" }]);

    await doc.delete();
    await expect(Doc.one("a1", false)).resolves.toBeUndefined();
  })
})

describe("conflict", () => {
  class Asset extends Type {
    id = str({ primary: true });
    file = str({ unique: true });
    made = num();
  }

  function statements(db: Connection.Ready<SQLiteConnection>){
    const prepare = spy(db, "prepare");

    return () => prepare.mock.results.map(result => String(result.value));
  }

  it("will update a conflicting row", async () => {
    const db = await TestConnection.new([Asset]);
    const sql = statements(db);

    await Asset.insert({ id: "a", file: "one", made: 1 });
    await expect(Asset.insert({ id: "a", file: "two", made: 2 }, { conflict: "update", keep: ["made"] }))
      .resolves.toEqual({ id: "a", file: "two", made: 1 });
    await expect(db.select("asset", [])).resolves.toEqual([{ id: "a", file: "two", made: 1 }]);

    expect(sql()[1]).toMatchInlineSnapshot(`
      "INSERT INTO
        asset (id, file, made)
      SELECT
        ?,
        ?,
        ? ON CONFLICT (id) DO
      UPDATE
      SET
        file = excluded.file RETURNING asset.id AS "id",
        asset.file AS "file",
        asset.made AS "made""
    `);
  })

  it("will ignore a conflicting row", async () => {
    const db = await TestConnection.new([Asset]);
    const sql = statements(db);

    await Asset.insert({ id: "a", file: "one", made: 1 });
    await expect(Asset.insert({ id: "b", file: "one", made: 2 }, { conflict: "ignore", on: "file" }))
      .resolves.toBeUndefined();
    await expect(db.select("asset", [])).resolves.toEqual([{ id: "a", file: "one", made: 1 }]);

    expect(sql()[1]).toMatchInlineSnapshot(`
      "INSERT INTO
        asset (id, file, made)
      SELECT
        ?,
        ?,
        ? ON CONFLICT (file) DO NOTHING RETURNING asset.id AS "id",
        asset.file AS "file",
        asset.made AS "made""
    `);
  })

  it("will return the row with nothing left to update", async () => {
    const db = await TestConnection.new([Asset]);
    const sql = statements(db);

    await Asset.insert({ id: "a", file: "one", made: 1 });
    await expect(Asset.insert({ id: "a", file: "two", made: 2 }, { conflict: "update", keep: ["file", "made"] }))
      .resolves.toEqual({ id: "a", file: "one", made: 1 });

    expect(sql()[1]).toMatchInlineSnapshot(`
      "INSERT INTO
        asset (id, file, made)
      SELECT
        ?,
        ?,
        ? ON CONFLICT (id) DO
      UPDATE
      SET
        id = excluded.id RETURNING asset.id AS "id",
        asset.file AS "file",
        asset.made AS "made""
    `);
  })
})

describe("composite key", () => {
  class Account extends Type {
    name = str();
  }

  class Pick extends Type {
    id = key(() => [this.account, this.kind]);
    account = one(Account);
    kind = str();
    note = str(orNull);
  }

  it("will create a composite primary key", () => {
    const db = TestConnection.new([Account, Pick]);

    expect(db.schema).toMatchInlineSnapshot(`
      "CREATE TABLE
        account (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );

      CREATE TABLE
        pick (
          account_id INTEGER NOT NULL REFERENCES account (id),
          kind TEXT NOT NULL,
          note TEXT,
          PRIMARY KEY (account_id, kind)
        );"
    `);
  })

  it("will round trip by tuple", async () => {
    const db = await TestConnection.new([Account, Pick]);

    await Account.insert({ name: "Gabe" });
    await expect(Pick.insert({ account: 1, kind: "a", note: "first" }))
      .resolves.toEqual({ id: '[1,"a"]', account: 1, kind: "a", note: "first" });
    await Pick.insert({ account: 1, kind: "b" });

    const pick = await Pick.get([1, "a"]);

    await pick.set({ note: "second" });
    await Pick.update([1, "b"], { note: "third" });
    await expect(db.select("pick", [])).resolves.toEqual([
      { account_id: 1, kind: "a", note: "second" },
      { account_id: 1, kind: "b", note: "third" }
    ]);

    await pick.delete();
    await Pick.delete([1, "b"]);
    await expect(db.select("pick", [])).resolves.toEqual([]);
  })

  it("will upsert on the composite key", async () => {
    await TestConnection.new([Account, Pick]);
    await Account.insert({ name: "Gabe" });
    await Pick.insert({ account: 1, kind: "a", note: "first" });

    await expect(Pick.insert({ account: 1, kind: "a", note: "second" }, { conflict: "update" }))
      .resolves.toMatchObject({ note: "second" });
    await expect(Pick.insert({ account: 1, kind: "a" }, { conflict: "ignore" }))
      .resolves.toBeUndefined();
  })

  it("will adopt an existing table", async () => {
    const db = SQLiteConnection.new([Account, Pick]);
    const engine = await db["db"]();

    await engine.exec(`
      CREATE TABLE account (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE pick (account_id INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT, PRIMARY KEY (account_id, kind));
      INSERT INTO pick VALUES (1, 'a', 'kept');
    `);

    await db;
    await expect(Pick.one([1, "a"])).resolves.toMatchObject({ note: "kept" });
    await db.close();
  })

  it("will adopt key parts not declared NOT NULL", async () => {
    const db = SQLiteConnection.new([Account, Pick]);
    const engine = await db["db"]();

    await engine.exec(`
      CREATE TABLE account (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE pick (account_id INTEGER, kind TEXT, note TEXT, PRIMARY KEY (account_id, kind));
    `);

    await expect(db.then()).resolves.toBeUndefined();
    await db.close();
  })
})

describe("transaction", () => {
  class Item extends Type {
    label = str();
  }

  it("will commit", async () => {
    const db = await TestConnection.new([Item]);
    const old = await Item.new({ label: "old" });

    const result = await db.transaction(async () => {
      await Item.insert({ label: "one" });
      await old.delete();

      expect(old.get(null)).toBe(false);

      return "done";
    });

    expect(result).toBe("done");
    expect(old.get(null)).toBe(true);
    await expect(Item.find()).resolves.toEqual([{ id: 2, label: "one" }]);
  })

  it("will roll back and restore instances", async () => {
    const db = await TestConnection.new([Item]);
    const kept = await Item.new({ label: "kept" });
    const gone = await Item.new({ label: "gone" });
    let created!: Item;

    const failed = db.transaction(async () => {
      await kept.set({ label: "first" });
      await kept.set({ label: "changed" });
      await gone.delete();
      created = await Item.new({ label: "new" });

      expect(kept.label).toBe("changed");
      expect(await Item.find()).toHaveLength(2);

      throw new Error("nope");
    });

    await expect(failed).rejects.toThrow("nope");

    expect(kept.label).toBe("kept");
    expect(gone.get(null)).toBe(false);
    expect(created.get(null)).toBe(true);
    await expect(Item.find()).resolves.toEqual([
      { id: 2, label: "gone" },
      { id: 1, label: "kept" }
    ]);
  })

  it("will join an open transaction", async () => {
    const db = await TestConnection.new([Item]);

    await expect(db.transaction(async () => {
      await Item.insert({ label: "outer" });
      await db.transaction(() => Item.insert({ label: "inner" }));
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(Item.find()).resolves.toEqual([]);
  })

  it("will keep a caught nested failure's writes", async () => {
    const db = await TestConnection.new([Item]);

    await db.transaction(async () => {
      await db.transaction(async () => {
        await Item.insert({ label: "inner" });
        throw new Error("nope");
      }).catch(() => {});

      await Item.insert({ label: "outer" });
    });

    await expect(Item.find()).resolves.toHaveLength(2);
  })

  it("will hold other statements until it ends", async () => {
    const db = await TestConnection.new([Item]);
    const order: string[] = [];
    let resume!: () => void;

    const open = db.transaction(async () => {
      await Item.insert({ label: "inside" });
      await new Promise<void>(resolve => resume = resolve);
      order.push("commit");
    });

    await vi.waitFor(() => expect(resume).toBeDefined());

    const outside = Item.find().then(rows => order.push(`read ${rows.length}`));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(order).toEqual([]);

    resume();
    await Promise.all([open, outside]);

    expect(order).toEqual(["commit", "read 1"]);
  })

  it("will queue transactions", async () => {
    const db = await TestConnection.new([Item]);
    const order: string[] = [];

    await Promise.all(["a", "b"].map(label => db.transaction(async () => {
      order.push(`${label} begin`);
      await Item.insert({ label });
      order.push(`${label} end`);
    })));

    expect(order).toEqual(["a begin", "a end", "b begin", "b end"]);
  })

  it("will keep connections apart", async () => {
    class Note extends Type {
      text = str();
    }

    const items = await TestConnection.new([Item]);
    const notes = await TestConnection.new([Note]);

    await expect(items.transaction(async () => {
      await Item.insert({ label: "one" });
      await notes.transaction(() => Note.insert({ text: "kept" }));
      await Item.insert({ label: "two" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(Item.find()).resolves.toEqual([]);
    await expect(Note.find()).resolves.toHaveLength(1);
  })
})

describe("sync", () => {
  it("will reopen a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "expressive-sql-"));
    const file = join(dir, "test.db");

    class Author extends Type {
      name = str();
      meta = json<{ tags: string[] }>();
    }

    class Post extends Type {
      author = one(Author);
      title = str({ nullable: true });
    }

    try {
      const first = await SQLiteConnection.new([Author, Post], file);
      const author = await Author.insert({ name: "Gabe", meta: { tags: ["a"] } });

      await Post.insert({ author: author.id });
      await first.close();

      const second = await SQLiteConnection.new([Author, Post], file);
      const post = await Post.one();

      expect(post).toEqual({ id: 1, author: 1, title: undefined });
      expect((await Author.get(post.author)).name).toBe("Gabe");
      expect((await Author.one(1)).meta).toEqual({ tags: ["a"] });

      await second.close();
    }
    finally {
      rmSync(dir, { recursive: true });
    }
  })

  it("will add missing columns to a reopened file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "expressive-sql-"));
    const file = join(dir, "test.db");

    class Author extends Type {
      name = str();
    }

    const Before = class Post extends Type {
      title = str();
    }

    const After = class Post extends Type {
      title = str();
      note = str({ nullable: true });
      rank = num({ fallback: 3 });
      author = one(Author, { nullable: true });
    }

    try {
      const first = await SQLiteConnection.new([Author, Before], file);

      await Before.insert({ title: "Old" });
      await first.close();

      const second = await SQLiteConnection.new([Author, After], file);
      const author = await Author.insert({ name: "Gabe" });

      await After.insert({ title: "New", note: "hi", rank: 1, author: author.id });

      expect(await After.one(1)).toEqual({ id: 1, title: "Old", note: undefined, rank: 3, author: undefined });
      expect(await After.one(2)).toEqual({ id: 2, title: "New", note: "hi", rank: 1, author: 1 });

      await second.close();
    }
    finally {
      rmSync(dir, { recursive: true });
    }
  })

  it("will report columns it cannot add and change nothing", async () => {
    class Post extends Type {
      title = str();
      note = str({ nullable: true });
      email = str();
      code = str({ nullable: true, unique: true });
      at = date({ fallback: "NOW" });
    }

    const conn = SQLiteConnection.new([Post]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL)");

    await expect(conn.sync()).rejects.toThrow(
      "Column email in table post is NOT NULL without a default and cannot be added to existing rows.\n" +
      "Column code in table post is UNIQUE and cannot be added by SQLite.\n" +
      "Column at in table post defaults to the current time and cannot be added by SQLite."
    );

    expect((await db.all("PRAGMA table_info(post)")).map(col => col.name)).toEqual(["id", "title"]);
    await conn.close();
  })

  it("will report a missing primary key", async () => {
    class Post extends Type {
      title = str();
    }

    const conn = SQLiteConnection.new([Post]);

    await (await conn["db"]()).exec("CREATE TABLE post (title TEXT NOT NULL)");
    await expect(conn.sync()).rejects.toThrow(
      "Column id in table post is a primary key and cannot be added to an existing table."
    );
    await conn.close();
  })

  it("will report missing columns without fix", async () => {
    class Post extends Type {
      title = str();
      note = str({ nullable: true });
    }

    const conn = SQLiteConnection.new([Post]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL)");
    await expect(conn.sync(false)).rejects.toThrow("Column note does not exist in table post");

    expect((await db.all("PRAGMA table_info(post)")).map(col => col.name)).toEqual(["id", "title"]);
    await conn.close();
  })

  it("will ignore columns not on the class", async () => {
    class Post extends Type {
      title = str();
    }

    const conn = SQLiteConnection.new([Post]);

    await (await conn["db"]()).exec(
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL, legacy TEXT NOT NULL DEFAULT 'x')"
    );
    await conn.sync();
    await Post.insert({ title: "Hi" });

    expect(await Post.one()).toEqual({ id: 1, title: "Hi" });
    await conn.close();
  })

  it("will throw for a missing table without fix", async () => {
    class Foo extends Type {}

    const conn = SQLiteConnection.new([Foo]);

    await expect(conn.sync(false)).rejects.toThrow("Table foo does not exist.");
    await conn.close();
  })

  it("will throw for a class with a schema", async () => {
    class Foo extends Type {
      static schema = "app";
    }

    const conn = SQLiteConnection.new([Foo]);

    await expect(conn.sync()).rejects.toThrow("static schema is not supported by SQLiteConnection.");
    await conn.close();
  })

  it("will throw if already active", async () => {
    class Foo extends Type {}

    const conn = await TestConnection.new([Foo]);

    await expect(conn.sync()).rejects.toThrow("Connection is already active.");
  })
})

describe("index", () => {
  async function indexes(conn: object, table: string){
    const db = await (conn as SQLiteConnection)["db"]();
    const list: { name: string }[] = await db.all(`PRAGMA index_list(${table})`);

    return list.map(({ name }) => name).filter(name => !name.startsWith("sqlite_")).sort();
  }

  it("will create indexes with a new table", async () => {
    class Post extends Type {
      slug = str(index);
      author = num({ index: "by_author" });
      code = str({ unique: true, index: true });
    }

    const conn = await TestConnection.new([Post]);

    expect(conn.schema).toContain("CREATE INDEX IF NOT EXISTS by_author ON post (author);");
    expect(await indexes(conn, "post")).toEqual(["by_author", "post_slug"]);
  })

  it("will add missing indexes to an existing table", async () => {
    class Post extends Type {
      slug = str(index);
      title = str(index);
    }

    const conn = SQLiteConnection.new([Post]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL)");
    await db.exec("CREATE INDEX existing ON post (title)");
    await db.exec("CREATE INDEX pair ON post (slug, title)");
    await conn.sync();

    expect(await indexes(conn, "post")).toEqual(["existing", "pair", "post_slug"]);

    await conn.close();
  })
})

describe("timestamps", () => {
  it("will fill created and updated from the database", async () => {
    class Post extends Type {
      title = str();
      created = date.created({ type: "ms" });
      updated = date.updated();
    }

    const conn = await TestConnection.new([Post]);
    const before = Date.now();
    const post = await Post.insert({ title: "a" });

    expect(conn.schema.replace(/\s+/g, " ")).toContain("created INTEGER NOT NULL DEFAULT ( CAST( (JULIANDAY('now') - 2440587.5) * 86400000 AS INTEGER ) )");
    expect(post.created.getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(post.updated.toISOString()).toMatch(/\.\d{3}Z$/);

    await Post.update(post.id, { title: "b" });

    const after = await Post.one(post.id);

    expect(after.created).toEqual(post.created);
    expect(after.updated.getTime()).toBeGreaterThanOrEqual(post.updated.getTime());
  })

  it("will fill defaults an existing table lacks", async () => {
    class Image extends Type {
      status = str(null, { fallback: "done" });
      created = date.created({ type: "ms" }, null);
      legacy = date(null, { fallback: "NOW" });
    }

    const conn = SQLiteConnection.new([Image]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE image (id INTEGER NOT NULL PRIMARY KEY, status TEXT, created INTEGER, legacy TEXT)");
    await conn.sync();

    const image = await Image.insert({});

    expect(image.status).toBe("done");
    expect(image.created).toBeInstanceOf(Date);
    expect(image.legacy).toBeInstanceOf(Date);
    await conn.close();
  })

  it("will keep created on replace", async () => {
    class Image extends Type {
      id = key({ type: "text", column: "name" });
      prompt = str(null);
      created = date.created();
      mtime = date.updated();
    }

    await TestConnection.new([Image]);

    const first = await Image.insert({ id: "a", prompt: "p", created: new Date(1) });
    const second = await Image.insert({ id: "a" }, { conflict: "replace" });

    expect(second.created).toEqual(new Date(1));
    expect(second.prompt).toBeUndefined();
    expect(second.mtime.getTime()).toBeGreaterThanOrEqual(first.mtime.getTime());
  })

  it("will compare and write the database time", async () => {
    class Session extends Type {
      id = key({ type: "text" });
      expires = date({ type: "ms" });
    }

    await TestConnection.new([Session]);
    await Session.insert({ id: "old", expires: new Date(1) });
    await Session.insert({ id: "new", expires: new Date(Date.now() + 60000) });

    expect(await Session.delete({ expires: lessThan(now) })).toBe(1);
    expect(await Session.count()).toBe(1);

    await Query(where => {
      const session = where(Session);

      where(session.expires).over(now);
      where(session).update({ expires: now });
    });

    expect((await Session.one("new")).expires.getTime()).toBeLessThanOrEqual(Date.now());
  })

  it("will add a nullable column defaulting to now", async () => {
    class Post extends Type {
      title = str();
      at = date.created({ type: "ms" }, null);
    }

    const conn = SQLiteConnection.new([Post]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL); INSERT INTO post (title) VALUES ('old');");
    await conn.sync();
    await Post.insert({ title: "new" });

    const [old, post] = await Post.find({ id: asc() });

    expect(old.at).toBeUndefined();
    expect(post.at).toBeInstanceOf(Date);
    await conn.close();
  })

  it("will not add a column defaulting to now", async () => {
    class Post extends Type {
      title = str();
      at = date.created({ type: "ms" });
    }

    const conn = SQLiteConnection.new([Post]);
    const db = await conn["db"]();

    await db.exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL)");
    await expect(conn.sync()).rejects.toThrow("Column at in table post defaults to the current time and cannot be added by SQLite.");
    await conn.close();
  })
})

describe("query writes", () => {
  class Asset extends Type {
    kind = str();
    file = str();
    loras = json<{ file: string }[]>(null);
  }

  it("will match, update and delete by columns", async () => {
    await TestConnection.new([Asset]);
    await Asset.insert({ kind: "loras", file: "a", loras: [{ file: "x" }] });
    await Asset.insert({ kind: "loras", file: "b", loras: [{ file: "y" }] });
    await Asset.insert({ kind: "models", file: "a" });

    expect(await Asset.count({ kind: "loras", file: "a" })).toBe(1);
    expect(await Asset.count({ loras: isLike('%"x"%') })).toBe(1);
    expect(await Asset.update({ kind: "loras", file: "a" }, { file: "c" })).toBe(1);
    expect((await Asset.find({ loras: isLike('%"y"%') })).map(asset => asset.file)).toEqual(["b"]);
    expect(await Asset.delete({ file: "a" })).toBe(1);
    expect(await Query(where => {
      const asset = where(Asset);

      where(asset).match({ kind: "loras", file: "c" });
    })).toBe(1);
  })

  it("will settle a date into every loaded instance", async () => {
    class Event extends Type {
      kind = str();
      at = date();
    }

    await TestConnection.new([Event]);

    const { id: first } = await Event.insert({ kind: "a", at: new Date(5) });
    const { id: second } = await Event.insert({ kind: "a", at: new Date(1) });
    const loaded = [await Event.get(first), await Event.get(second)];

    await Event.update({ kind: "a" }, { at: new Date(5) });

    expect(loaded.map(event => event.at)).toEqual([new Date(5), new Date(5)]);
  })
})

describe("plan", () => {
  async function open(types: Type.Class[], ddl?: string){
    const conn = SQLiteConnection.new(types);
    const db = await conn["db"]();

    if (ddl)
      await db.exec(ddl);

    return { conn, db };
  }

  it("will list what sync would change", async () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      title = str();
      note = str(null);
      slug = str(index);
    }

    const { conn } = await open([Author, Post], "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL)");
    const { steps, problems } = await conn.plan();

    expect(problems).toEqual([]);
    expect(steps.map(({ table, column, action, reason }) => ({ table, column, action, reason }))).toEqual([
      { table: "author", column: undefined, action: "create table author", reason: "Table author does not exist." },
      { table: "post", column: "note", action: "add column note to post", reason: "Column note does not exist in table post" },
      { table: "post", column: "slug", action: "create index post_slug on post", reason: "Index post_slug does not exist on post" }
    ]);

    await expect(conn.sync(false)).rejects.toThrow(
      "Table author does not exist.\n" +
      "Column note does not exist in table post\n" +
      "Index post_slug does not exist on post"
    );

    await conn.close();
  })

  it("will accept a reference to a table it creates", async () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(Author);
    }

    const { conn } = await open([Post, Author], "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL)");

    expect((await conn.plan()).problems).toEqual([]);
    await expect(conn.valid(Post)).rejects.toThrow("Referenced table author does not exist");
    await conn.close();
  })

  it("will throw for a column without a datatype", async () => {
    class Foo extends Type {
      bar = str({ type: "" as "text" });
    }

    const { conn } = await open([Foo]);

    await expect(conn.plan()).rejects.toThrow("Column bar has no datatype. Is @expressive/orm installed twice?");
    await conn.close();
  })

  it("will not move a relation off its old column", async () => {
    class User extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(User);
    }

    const { conn } = await open([Post, User],
      "CREATE TABLE user (id INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL);" +
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES user (id));"
    );

    expect((await conn.plan()).problems).toEqual([
      'Column author_id in table post is missing but user_id exists; add { column: "user_id" } to Post.author to keep it.'
    ]);
    await conn.close();
  })

  it("will report a class with a schema", async () => {
    class Foo extends Type {
      static schema = "app";
    }

    const { conn } = await open([Foo]);

    expect(await conn.plan()).toEqual({ steps: [], problems: ["static schema is not supported by SQLiteConnection."] });
    await conn.close();
  })

  it("will report drift unless forced", async () => {
    class Post extends Type {
      title = str();
    }

    const { conn } = await open([Post], "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT)");

    expect((await conn.plan()).problems).toEqual(["Column title in table post has incorrect nullable value"]);
    expect((await conn.plan(true)).steps.map(step => [step.action, step.reason])).toEqual([
      ["rebuild table post", "Column title in table post has incorrect nullable value"]
    ]);

    await conn.close();
  })

  it("will rebuild drifted columns and keep the rest", async () => {
    class Post extends Type {
      title = str();
      rank = num(null);
      score = num({ type: "real", nullable: true });
      note = str(null);
    }

    const { conn, db } = await open([Post],
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT, rank TEXT, score TEXT, legacy TEXT NOT NULL DEFAULT 'x', extra INTEGER);" +
      "CREATE INDEX post_legacy ON post (legacy);" +
      "CREATE TRIGGER post_seen AFTER UPDATE ON post BEGIN SELECT 1; END;" +
      "INSERT INTO post (title, rank, score, legacy, extra) VALUES ('a', ' 42', '1.5', 'kept', NULL), ('b', '7', NULL, 'y', 3);"
    );

    await conn.sync(true, true);

    expect(await db.all("SELECT * FROM post ORDER BY id")).toEqual([
      { id: 1, title: "a", rank: 42, score: 1.5, note: null, legacy: "kept", extra: null },
      { id: 2, title: "b", rank: 7, score: null, note: null, legacy: "y", extra: 3 }
    ]);
    expect(await db.all("PRAGMA index_list(post)")).toEqual([expect.objectContaining({ name: "post_legacy" })]);
    expect(await db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'")).toEqual([{ name: "post_seen" }]);
    expect(await conn.valid(Post)).toEqual([]);

    await conn.close();
  })

  it("will rebuild a composite-keyed table", async () => {
    class Tag extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
    }

    const { conn, db } = await open([Tag],
      "CREATE TABLE tag (post TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (post, name));" +
      "INSERT INTO tag VALUES ('1', 'a');"
    );

    await conn.sync(true, true);

    expect(await db.all("SELECT post, typeof(post) AS kind FROM tag")).toEqual([{ post: 1, kind: "integer" }]);
    await conn.close();
  })

  it("will rebuild a referenced table without touching its children", async () => {
    class Author extends Type {
      rank = num();
    }

    const { conn, db } = await open([Author],
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL);" +
      "CREATE TABLE post (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES author (id) ON DELETE CASCADE);" +
      "INSERT INTO author (rank) VALUES ('1');" +
      "INSERT INTO post (author_id) VALUES (1), (1);"
    );

    await conn.sync(true, true);

    expect(await db.all("SELECT id, author_id FROM post")).toEqual([{ id: 1, author_id: 1 }, { id: 2, author_id: 1 }]);
    expect(await db.get("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
    await conn.close();
  })

  it("will not rebuild over a broken reference", async () => {
    class Author extends Type {
      rank = num();
    }

    const { conn, db } = await open([Author],
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL);" +
      "CREATE TABLE post (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES author (id));" +
      "PRAGMA foreign_keys = OFF;" +
      "INSERT INTO post (author_id) VALUES (9), (8);" +
      "PRAGMA foreign_keys = ON;"
    );

    await expect(conn.sync(true, true)).rejects.toThrow("Cannot rebuild: post has references to missing rows (2).");
    expect(await db.all("PRAGMA table_info(author)")).toContainEqual(expect.objectContaining({ name: "rank", type: "TEXT" }));
    await conn.close();
  })

  it("will refuse to rebuild rows that do not fit", async () => {
    class Post extends Type {
      title = str();
      rank = num(null);
      score = num({ type: "real", nullable: true });
    }

    const { conn, db } = await open([Post],
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title TEXT, rank TEXT, score TEXT);" +
      "INSERT INTO post (title, rank, score) VALUES (NULL, '1.5', 'x'), (NULL, 'abc', '2'), ('c', '3.0', ''), " +
      "('d', '-', '.'), ('e', '1-2', 'e'), ('f', '1e3', '-'), ('g', ' 7 ', '1e3');"
    );

    expect((await conn.plan(true)).problems).toEqual([
      "Column title in table post cannot be rebuilt: 2 rows are NULL.",
      "Column rank in table post cannot be rebuilt: 5 rows are not INTEGER.",
      "Column score in table post cannot be rebuilt: 5 rows are not REAL."
    ]);

    await db.exec("DELETE FROM post WHERE id <> 3");

    expect((await conn.plan(true)).problems).toEqual([
      "Column score in table post cannot be rebuilt: 1 row is not REAL."
    ]);

    await conn.close();
  })

  it("will not alter a text column's values", async () => {
    class Post extends Type {
      title = str();
    }

    const { conn, db } = await open([Post],
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, title INTEGER NOT NULL);" +
      "INSERT INTO post (title) VALUES (5);"
    );

    await conn.sync(true, true);

    expect(await db.all("SELECT title, typeof(title) AS kind FROM post")).toEqual([{ title: "5", kind: "text" }]);
    await conn.close();
  })

  it("will apply nothing if a step fails", async () => {
    class Post extends Type {
      title = str();
    }

    const { conn, db } = await open([Post]);

    spy(conn, "plan").mockResolvedValue({
      steps: [{ table: "post", action: "create table post", reason: "", sql: ["CREATE TABLE post (id INTEGER);", "NOT SQL;"] }],
      problems: []
    });

    await expect(conn.sync()).rejects.toThrow();
    expect(await db.all("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);

    await conn.close();
  })
})

describe("valid", () => {
  const Author = class Author extends Type {
    name = str();
    rank = num({ nullable: true });
  }

  async function check(type: Type.Class, ddl: string){
    const conn = SQLiteConnection.new([type]);

    await (await conn["db"]()).exec(ddl);

    return conn.valid(type).finally(() => conn.close());
  }

  it("will be false for a missing table", async () => {
    const conn = SQLiteConnection.new([Author]);

    expect(await conn.valid(Author)).toBe(false);
    await conn.close();
  })

  it("will list a missing column", async () => {
    const absent = await check(Author, "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)");

    expect(absent).toEqual([Author.fields.get("rank")]);
  })

  it("will throw for a mismatched type", async () => {
    await expect(check(Author, "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name INTEGER NOT NULL, rank INTEGER)"))
      .rejects.toThrow("Column name in table author has type INTEGER, expected TEXT");
  })

  it("will accept a primary key not declared NOT NULL", async () => {
    await expect(check(Author, "CREATE TABLE author (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rank INTEGER)"))
      .resolves.toEqual([]);
  })

  it("will throw for a mismatched nullable", async () => {
    await expect(check(Author, "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name TEXT, rank INTEGER)"))
      .rejects.toThrow("Column name in table author has incorrect nullable value");
  })

  it("will throw for a reference on another connection", async () => {
    class Post extends Type {
      author = one(Author);
    }

    const other = SQLiteConnection.new([Author]);

    await expect(check(Post, "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL)"))
      .rejects.toThrow("Foreign key author.id cannot be checked by another connection");

    await other.close();
  })

  it("will throw for a missing referenced table", async () => {
    class Post extends Type {
      author = one(Author);
    }

    const conn = SQLiteConnection.new([Author, Post]);

    await (await conn["db"]()).exec("CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL)");
    await expect(conn.valid(Post)).rejects.toThrow("Referenced table author does not exist");
    await conn.close();
  })

  it("will throw for a missing referenced column", async () => {
    class Post extends Type {
      author = one(Author);
    }

    const conn = SQLiteConnection.new([Author, Post]);

    await (await conn["db"]()).exec(
      "CREATE TABLE author (other INTEGER NOT NULL PRIMARY KEY);" +
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL)"
    );
    await expect(conn.valid(Post)).rejects.toThrow("Referenced column id does not exist in table author");
    await conn.close();
  })
})

describe("prepare", () => {
  it("will report a failed statement", async () => {
    class Foo extends Type {
      name = str();
    }

    const conn = SQLiteConnection.new([Foo]);

    await expect(Foo.find({})).rejects.toThrow(/^Error running SQL: no such table: foo\nSELECT/);
    await conn.close();
  })

  it("will report raw SQL it cannot format", async () => {
    class Foo extends Type {
      name = str();
    }

    await TestConnection.new([Foo]);

    const query = Query((where, sql) => {
      where(Foo);

      return sql("'oops");
    });

    await expect(query).rejects.toThrow(/^Error running SQL: unrecognized token: "'oops.*\nSELECT 'oops FROM `foo`$/);
    expect(String(query)).toBe("SELECT 'oops FROM `foo`");
  })

  it("will run without parameters", async () => {
    class Foo extends Type {
      name = str();
    }

    const conn = await TestConnection.new([Foo]);
    const builder = new Builder();

    builder.use(Foo);

    expect(await conn.prepare(builder).all()).toEqual([{ "COUNT(*)": 0 }]);
  })

  it("will rethrow a non-error", async () => {
    class Foo extends Type {
      name = str();
    }

    const conn = SQLiteConnection.new([Foo]);

    spy(conn as any, "db").mockResolvedValue({
      all: () => Promise.reject("nope")
    });

    await expect(Foo.find({})).rejects.toBe("nope");
    await conn.close();
  })

  it("will throw for an unjoined update", () => {
    class Foo extends Type {
      name = str();
    }

    class Bar extends Type {}

    TestConnection.new([Foo, Bar]);

    expect(() => Query(where => {
      const foo = where(Foo);

      where(Bar);
      where(foo).update({ name: "x" });
    })).toThrow("Table bar has no joins.");
  })
})

describe("quoting", () => {
  const values = ["it's", 'say "hi"', "back\\slash \\'", "x\\' OR 1=1 --"];

  it("will round trip quotes and backslashes", async () => {
    class User extends Type {
      name = str();
      note = str({ nullable: true });
    }

    await TestConnection.new([User]);

    for (const name of values)
      await Query(where => void where(User, { name }));

    await Query(where => {
      const user = where(User);

      where(user.id).equal(1);
      where(user).update({ note: values[2] });
    });

    for (const name of values) {
      const found = await Query(where => {
        const user = where(User);

        where(user.name).equal(name);

        return user.name;
      });

      expect(found).toEqual([name]);
    }

    const [note] = await Query(where => {
      const user = where(User);

      where(user.id).equal(1);

      return user.note;
    });

    expect(note).toBe(values[2]);
  })

  it("will not inject through a string literal", async () => {
    class User extends Type {
      name = str();
    }

    await TestConnection.new([User]);
    await User.insert({ name: "Gabe" });

    const found = await Query(where => {
      const user = where(User);

      where(user.name).equal("x\\' OR 1=1 --");

      return user.name;
    });

    expect(found).toEqual([]);
  })
})

describe("null", () => {
  function define() {
    class NullRef extends Type {
      name = str();
    }

    class NullRow extends Type {
      s = str(orNull);
      n = num(orNull);
      b = bool(orNull);
      d = date(orNull);
      u = uuid(orNull);
      j = json<{ a: number }>(orNull);
      o = one(NullRef, orNull);
    }

    return { NullRef, NullRow };
  }

  const empty = { s: undefined, n: undefined, b: undefined, d: undefined, u: undefined, j: undefined, o: undefined };

  it("will read null as undefined", async () => {
    const { NullRef, NullRow } = define();
    await TestConnection.new([NullRef, NullRow]);

    const omitted = await NullRow.insert({ s: null });
    const nulls = await NullRow.insert({ s: null, n: null, b: null, d: null, u: null, j: null, o: null });

    expect(omitted).toEqual({ id: omitted.id, ...empty });
    expect(nulls).toEqual({ id: nulls.id, ...empty });
    expect(Object.values(nulls).filter(x => x === null)).toEqual([]);
    expect(Object.values(await NullRow.one(nulls.id)).filter(x => x === null)).toEqual([]);
    expect(await NullRow.find()).toEqual([{ id: nulls.id, ...empty }, { id: omitted.id, ...empty }]);

    const entity = await NullRow.get(nulls.id);

    expect(entity.columns).toEqual({ id: nulls.id, ...empty });
    expect(Object.values(entity.get()).filter(x => x === null)).toEqual([]);

    const [projected] = await Query(where => {
      const row = where(NullRow);

      where(row.id).equal(nulls.id);

      return { n: row.n, s: row.s, row };
    });

    expect(projected).toEqual({ n: undefined, s: undefined, row: { id: nulls.id, ...empty } });
    await expect(Query(where => where(NullRow).n)).resolves.toEqual([undefined, undefined]);
  })

  it("will write null to clear each column", async () => {
    const { NullRef, NullRow } = define();
    await TestConnection.new([NullRef, NullRow]);

    const ref = await NullRef.new({ name: "Ref" });
    const entity = await NullRow.new({ s: "a", n: 2, b: true, d: new Date(0), u: "x1", j: { a: 1 }, o: ref });

    expect(entity.columns).toEqual({ id: entity.id, s: "a", n: 2, b: true, d: new Date(0), u: "x1", j: { a: 1 }, o: ref.id });

    await entity.set({ s: null, n: null, b: null, d: null, u: null, j: null, o: null });

    expect(entity.columns).toEqual({ id: entity.id, ...empty });
    expect(Object.values(entity.get()).filter(x => x === null)).toEqual([]);
    await expect(NullRow.one(entity.id)).resolves.toEqual({ id: entity.id, ...empty });

    await NullRow.update(entity.id, { n: 3 });
    await NullRow.update(entity.id, { n: null });

    expect(entity.n).toBeUndefined();
    await expect(NullRow.one(entity.id)).resolves.toEqual({ id: entity.id, ...empty });
  })
})

describe("engine", () => {
  it("will run on a given engine", async () => {
    class Foo extends Type {
      name = str();
    }

    const engine = await createEngine(":memory:");
    const all = vi.spyOn(engine, "all");
    const close = vi.spyOn(engine, "close");
    const conn = await SQLiteConnection.new([Foo], engine);

    await Foo.insert({ name: "bar" });

    await expect(Foo.find({})).resolves.toMatchObject([{ name: "bar" }]);
    expect(all).toHaveBeenCalled();

    await conn.close();

    expect(close).not.toHaveBeenCalled();
    await engine.close();
  })

  it("will not type an unknown source", async () => {
    // @ts-expect-error
    const conn = SQLiteConnection.new([], { execute: () => {} });

    await conn.close();
  })

  it.each([
    ["an unknown object", {}],
    ["null", null]
  ])("will throw on sync for %s", async (_, source) => {
    class Foo extends Type {
      name = str();
    }

    const conn = SQLiteConnection.new([Foo], source as Engine);

    await expect(conn).rejects.toThrow("Unknown SQLite source. Pass a filename, a libSQL address, a D1 binding, a libSQL client or an Engine.");
    await conn.close();

    expect(Foo.hasOwnProperty("connection")).toBe(false);
  })

  it("will unbind on close when the engine failed to open", async () => {
    class Foo extends Type {
      name = str();
    }

    vi.doMock("@libsql/client", () => { throw new Error("Cannot find module '@libsql/client'") });

    const conn = SQLiteConnection.new([Foo], "libsql://db.example.test");

    await expect(conn).rejects.toThrow();
    await conn.close();
    vi.doUnmock("@libsql/client");

    expect(Foo.hasOwnProperty("connection")).toBe(false);
  })

  async function hosted(){
    const engine: Engine = await createEngine(":memory:");

    engine.batch = vi.fn(async (sql: string[]) => {
      await engine.exec("BEGIN");

      try {
        for (const statement of sql)
          await engine.exec(statement);

        await engine.exec("COMMIT");
      }
      catch (error) {
        await engine.exec("ROLLBACK");
        throw error;
      }
    });

    engine.transaction = vi.fn(async () => {
      await engine.exec("BEGIN");

      return {
        all: vi.fn(engine.all),
        get: vi.fn(engine.get),
        run: vi.fn(engine.run),
        exec: vi.fn(engine.exec),
        commit: vi.fn(() => engine.exec("COMMIT")),
        rollback: vi.fn(() => engine.exec("ROLLBACK"))
      };
    });

    return engine;
  }

  it("will run a transaction on an engine session", async () => {
    class Foo extends Type {
      name = str();
    }

    const engine = await hosted();
    const conn = await SQLiteConnection.new([Foo], engine);

    await conn.transaction(async () => {
      await Foo.insert({ name: "kept" });
    });

    await expect(conn.transaction(async () => {
      await Foo.insert({ name: "gone" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    const [first, second] = await vi.mocked(engine.transaction!).mock.results.map(result => result.value);
    const session = await first;

    expect(session.all).toHaveBeenCalledOnce();
    expect(session.commit).toHaveBeenCalledOnce();
    expect((await second).rollback).toHaveBeenCalledOnce();
    await expect(Foo.find({})).resolves.toMatchObject([{ name: "kept" }]);

    await conn.close();
    await engine.close();
  })

  it("will throw the original error if rollback fails", async () => {
    class Foo extends Type {
      name = str();
    }

    const engine = await createEngine(":memory:");
    const conn = await SQLiteConnection.new([Foo], engine);

    engine.transaction = async () => ({
      ...engine,
      commit: () => Promise.reject(new Error("commit failed")),
      rollback: () => Promise.reject(new Error("already closed"))
    });

    await expect(conn.transaction(async () => {
      await Foo.insert({ name: "a" });
    })).rejects.toThrow("commit failed");

    await conn.close();
    await engine.close();
  })

  it("will sync through a batch", async () => {
    class Foo extends Type {
      name = str({ index: true });
    }

    const engine = await hosted();
    const conn = await SQLiteConnection.new([Foo], engine);

    expect(engine.batch).toHaveBeenCalledWith([
      expect.stringMatching(/^CREATE TABLE foo \(.*\);$/),
      "CREATE INDEX IF NOT EXISTS `foo_name` ON foo (`name`);"
    ]);

    await conn.close();
    await engine.close();
  })

  it("will batch a rebuild of a referenced table", async () => {
    class Author extends Type {
      rank = num();
    }

    const engine = await hosted();

    await engine.exec(
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL);" +
      "CREATE TABLE post (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES author (id) ON DELETE CASCADE);" +
      "INSERT INTO author (rank) VALUES ('1');" +
      "INSERT INTO post (author_id) VALUES (1), (1);"
    );

    const conn = SQLiteConnection.new([Author], engine);

    await conn.sync(true, true);

    expect(engine.batch).toHaveBeenCalledOnce();
    expect(await engine.get("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
    expect(await engine.all("SELECT id, author_id FROM post")).toEqual([{ id: 1, author_id: 1 }, { id: 2, author_id: 1 }]);
    expect(await engine.all("PRAGMA table_info(author)")).toContainEqual(expect.objectContaining({ name: "rank", type: "INTEGER" }));

    await conn.close();
    await engine.close();
  })

  it("will not batch a rebuild over a broken reference", async () => {
    class Author extends Type {
      rank = num();
    }

    const engine = await hosted();

    await engine.exec(
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL);" +
      "CREATE TABLE post (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES author (id));" +
      "PRAGMA foreign_keys = OFF;" +
      "INSERT INTO post (author_id) VALUES (9);" +
      "PRAGMA foreign_keys = ON;"
    );

    const conn = SQLiteConnection.new([Author], engine);

    await expect(conn.sync(true, true)).rejects.toThrow("Cannot rebuild: post has references to missing rows (1).");
    expect(engine.batch).not.toHaveBeenCalled();

    await conn.close();
    await engine.close();
  })

  it("will not batch a rebuild where foreign keys stay on", async () => {
    class Author extends Type {
      rank = num();
    }

    const engine = await hosted();
    const exec = engine.exec;

    await exec("CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, rank TEXT NOT NULL);");

    engine.exec = sql => sql.includes("foreign_keys") ? Promise.reject(new Error("not authorized")) : exec(sql);

    const conn = SQLiteConnection.new([Author], engine);

    await expect(conn.sync(true, true)).rejects.toThrow("Cannot rebuild: this engine keeps foreign keys on");
    expect(engine.batch).not.toHaveBeenCalled();

    await conn.close();
    await exec("SELECT 1");
    await engine.close();
  })
})

describe("d1", () => {
  async function open(){
    const mf = new Miniflare({
      modules: true,
      script: "export default { fetch: () => new Response() }",
      d1Databases: ["DB"]
    });

    const DB = await mf.getD1Database("DB");

    class Author extends Type {
      name = str({ index: true });
    }

    class Post extends Type {
      author = one(Author);
      title = str();
    }

    return { DB, engine: host(DB), Author, Post, dispose: () => mf.dispose() };
  }

  it("will sync and query", async () => {
    const { DB, engine, Author, Post, dispose } = await open();
    const conn = await SQLiteConnection.new([Author, Post], DB);
    const author = await Author.insert({ name: "Gabe" });

    await Post.insert({ author, title: "Hello" });
    await expect(Post.insert({ author: 99, title: "Orphan" })).rejects.toThrow("FOREIGN KEY constraint failed");
    await expect(Author.find({ name: "Gabe" })).resolves.toHaveLength(1);
    await expect(engine.all("PRAGMA index_list(author)")).resolves.toMatchObject([{ name: "author_name" }]);

    await conn.close();
    await dispose();
  })

  it("will not rebuild a table", async () => {
    const { DB, engine, Author, Post, dispose } = await open();

    await engine.exec("CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name INTEGER NOT NULL)");
    await engine.exec("CREATE TABLE post (\n  id INTEGER NOT NULL PRIMARY KEY,\n  author_id INTEGER NOT NULL REFERENCES author(id) ON DELETE CASCADE,\n  title TEXT NOT NULL\n)");
    await engine.exec("INSERT INTO author (name) VALUES ('Gabe')");
    await engine.exec("INSERT INTO post (author_id, title) VALUES (1, 'Hello')");

    const conn = SQLiteConnection.new([Author, Post], DB);

    await expect(conn.sync(true, true)).rejects.toThrow("Cannot rebuild: this engine keeps foreign keys on");
    await expect(engine.all("SELECT type FROM pragma_table_info('author') WHERE name = 'name'")).resolves.toEqual([{ type: "INTEGER" }]);
    await expect(engine.all("SELECT title FROM post")).resolves.toEqual([{ title: "Hello" }]);

    await conn.close();
    await dispose();
  })

  it("will refuse a transaction", async () => {
    const { DB, Author, Post, dispose } = await open();
    const conn = await SQLiteConnection.new([Author, Post], DB);

    await expect(conn.transaction(() => Author.insert({ name: "Gabe" }))).rejects.toThrow("D1 has no interactive transactions.");
    await expect(Author.find({})).resolves.toEqual([]);

    await conn.close();
    await dispose();
  })
})

const dirs: string[] = [];

describe.each([
  ["memory", () => ":memory:"],
  ["file", () => `file:${join(dirs[dirs.push(mkdtempSync(join(tmpdir(), "libsql-"))) - 1], "test.db")}`]
])("libsql %s", (_, url) => {
  afterAll(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true });
  });

  function open(){
    const client = createClient({ url: url() });

    class Author extends Type {
      name = str({ index: true });
    }

    class Post extends Type {
      author = one(Author, { onDelete: "cascade" });
      title = str();
    }

    return { client, engine: host(client), Author, Post };
  }

  it("will sync each statement", async () => {
    const { client, engine, Author, Post } = open();
    const conn = await SQLiteConnection.new([Author, Post], client);
    const author = await Author.insert({ name: "Gabe" });

    await Post.insert({ author, title: "Hello" });
    await expect(Author.find({ name: "Gabe" })).resolves.toHaveLength(1);
    await expect(engine.all("PRAGMA index_list(author)")).resolves.toMatchObject([{ name: "author_name" }]);

    await conn.close();
    client.close();
  })

  it("will commit and roll back", async () => {
    const { client, Author, Post } = open();
    const conn = await SQLiteConnection.new([Author, Post], client);

    await conn.transaction(() => Author.insert({ name: "kept" }));
    await expect(conn.transaction(async () => {
      await Author.insert({ name: "gone" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(Author.find({})).resolves.toMatchObject([{ name: "kept" }]);

    await conn.close();
    client.close();
  })

  it("will inspect inside a transaction", async () => {
    const { client, Author, Post } = open();
    const conn = await SQLiteConnection.new([Author, Post], client);

    await expect(conn.transaction(() => conn.valid(Post))).resolves.toEqual([]);

    await conn.close();
    client.close();
  })

  it("will inspect after a transaction elsewhere", async () => {
    const { client, Author, Post } = open();
    const conn = await SQLiteConnection.new([Author, Post], client);
    let release!: () => void;
    let started!: () => void;
    const holding = new Promise<void>(resolve => release = resolve);
    const opened = new Promise<void>(resolve => started = resolve);

    const tx = conn.transaction(async () => {
      started();
      await holding;
    });

    await opened;

    const checked = conn.valid(Post);

    release();

    await tx;
    await expect(checked).resolves.toEqual([]);

    await conn.close();
    client.close();
  })

  it("will rebuild a table through migrate", async () => {
    const { client, engine, Author, Post } = open();
    const migrate = vi.spyOn(client, "migrate");

    await engine.batch!([
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name INTEGER NOT NULL)",
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES author(id) ON DELETE CASCADE, title TEXT NOT NULL)",
      "INSERT INTO author (name) VALUES (1)",
      "INSERT INTO post (author_id, title) VALUES (1, 'Hello')"
    ]);

    const conn = SQLiteConnection.new([Author, Post], client);

    await conn.sync(true, true);

    expect(migrate).toHaveBeenCalledOnce();
    await expect(engine.all("SELECT type FROM pragma_table_info('author') WHERE name = 'name'")).resolves.toEqual([{ type: "TEXT" }]);
    await expect(engine.all("SELECT title FROM post")).resolves.toEqual([{ title: "Hello" }]);
    await expect(engine.get("PRAGMA foreign_keys")).resolves.toEqual({ foreign_keys: 1 });

    await conn.close();
    client.close();
  })

  it("will not rebuild over dangling references", async () => {
    const { client, engine, Author, Post } = open();

    await engine.exec("PRAGMA foreign_keys = OFF");
    await engine.batch!([
      "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name INTEGER NOT NULL)",
      "CREATE TABLE post (id INTEGER NOT NULL PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES author(id) ON DELETE CASCADE, title TEXT NOT NULL)",
      "INSERT INTO post (author_id, title) VALUES (9, 'Orphan')"
    ]);

    const conn = SQLiteConnection.new([Author, Post], client);

    await expect(conn.sync(true, true)).rejects.toThrow("Cannot rebuild: post has references to missing rows (1).");

    await conn.close();
    client.close();
  })
})
