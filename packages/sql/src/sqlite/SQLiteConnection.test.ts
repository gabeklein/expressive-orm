import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { asc, bool, Builder, date, desc, greaterThan, isIn, isLike, isNull, json, notNull, num, one, Query, str, Type, uuid } from '@expressive/orm';

import { spy } from '../../test.setup';

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
          created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    expect(test.values).toEqual({
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

    expect(foo).toBeInstanceOf(Foo);
    expect(foo.values).toEqual({ id: 1, bar: "hello", baz: "world" });
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

    expect(results.map(user => user.values)).toEqual([
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

  expect(results.map(user => user.values)).toEqual([
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

    expect(first.id).toBe(1);
    expect(second.views).toBe(0);
    expect(second.published).toBeUndefined();

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
    expect(await Post.one(1, true)).toBe(first);

    await second.update({ title: "Second!", draft: false, views: 10 });

    const titles = await Post.query((post, where) => {
      where(post.views).over(5);

      return { title: post.title, author: post.author.name };
    });

    expect(titles).toEqual([{ title: "Second!", author: "Gabe" }]);

    second.published = new Date("2024-02-01T00:00:00Z");
    await second.save();

    const [reloaded] = await Post.query((post, where) => {
      where(post.id).equal(2);

      return { published: post.published, draft: post.draft };
    });

    expect(reloaded).toEqual({ published: new Date("2024-02-01T00:00:00Z"), draft: false });

    await first.delete();

    expect(await Post.find()).toEqual([second]);
    expect(await Post.one(1, false)).toBeUndefined();
  })

  it("will update by id", async () => {
    await TestConnection.new([Author]);

    const author = await Author.insert({ name: "Gabe" });

    await Author.update(author.id, { name: "Bob" });

    const [renamed] = await Query(where => where(Author).name);

    expect(renamed).toBe("Bob");
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
    const user = await User.insert({ name: "Gabe" });

    expect(user.id).toBe(1);
    await expect(db.select("user", [])).resolves.toEqual([{ user_id: 1, name: "Gabe" }]);
    await expect(User.one(1, true)).resolves.toBe(user);

    await user.update({ name: "Bob" });
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
    const doc = await Doc.insert({ id: "a1", title: "Hello" });

    await expect(Doc.one("a1", true)).resolves.toBe(doc);

    await doc.update({ title: "Bye" });
    await expect(db.select("doc", [])).resolves.toEqual([{ doc_id: "a1", title: "Bye" }]);

    await doc.delete();
    await expect(Doc.one("a1", false)).resolves.toBeUndefined();
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

      expect(post.title).toBeNull();
      expect((await post.author).name).toBe("Gabe");
      expect((await Author.one(1)).meta).toEqual({ tags: ["a"] });

      await second.close();
    }
    finally {
      rmSync(dir, { recursive: true });
    }
  })

  it("will throw for a missing table without fix", async () => {
    class Foo extends Type {}

    const conn = SQLiteConnection.new([Foo]);

    await expect(conn.sync(false)).rejects.toThrow("Table foo does not exist.");
    await conn.close();
  })

  it("will throw if already active", async () => {
    class Foo extends Type {}

    const conn = await TestConnection.new([Foo]);

    await expect(conn.sync()).rejects.toThrow("Connection is already active.");
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

  it("will throw for a missing column", async () => {
    await expect(check(Author, "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)"))
      .rejects.toThrow("Column rank does not exist in table author");
  })

  it("will throw for a mismatched type", async () => {
    await expect(check(Author, "CREATE TABLE author (id INTEGER NOT NULL PRIMARY KEY, name INTEGER NOT NULL, rank INTEGER)"))
      .rejects.toThrow("Column name in table author has type INTEGER, expected TEXT");
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
