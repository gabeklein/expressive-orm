import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { PGlite } from '@electric-sql/pglite';

import { asc, bool, date, desc, greaterThan, isIn, isLike, isNull, json, notNull, num, one, Query, str, Type, uuid } from '@expressive/orm';
import type { Connection } from '@expressive/sql';

import { PGLiteConnection } from './PGLiteConnection';

const isWatchMode = process.env.VITEST_MODE === 'WATCH';

const shared = new PGlite();
let current: TestConnection | undefined;

afterEach(async () => current?.close());

class TestConnection extends PGLiteConnection {
  constructor(using: Connection.Types){
    super(using, shared);
    current = this;
  }

  async close(): Promise<void> {
    this.set(null);
    await this._unlisten;
    await shared.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  }
}

describe("persistence", () => {
  // Expensive so do not run in watch mode
  const it = isWatchMode ? test.skip : test;

  it('will not try to recreate database tables', async () => {
    class Users extends Type {
      name = str();
    }
    
    const pg = new PGlite();

    await PGLiteConnection.new([ Users ], pg);
    await Users.insert({ name: "Gabe" });

    Reflect.deleteProperty(Users, "connection");
    await PGLiteConnection.new([ Users ], pg);

    const user = await Users.one();

    expect(user.values).toEqual({ id: 1, name: "Gabe" });
  });

  it('will throw if missing table', async () => {
    class User extends Type {
      name = str();
    }
    
    class FooBar extends Type {
      name = str();
    }
    
    const pg = new PGlite();

    await PGLiteConnection.new([ User ], pg).sync(true);

    await expect((async () => {
      Reflect.deleteProperty(User, "connection");
      return PGLiteConnection.new([ User, FooBar ], pg).sync(false);
    })()).rejects.toThrow("Table foo_bar is expected but does not exist.");
  });

  it('will throw if table missing column', async () => {
    const User1 = class User extends Type {
      name = str();
    }
    
    const User2 = class User extends Type {
      name = str();
      rank = num();
    }
    
    const pg = new PGlite();

    await PGLiteConnection.new([ User1 ], pg);

    await expect((async () => {
      return PGLiteConnection.new([ User2 ], pg);
    })()).rejects.toThrow('Column "rank" does not exist in table user');
  });
  
  it('will ignore type mismatch if synonomous', async () => {
    class Item extends Type {
      name = str({ type: "varchar" });
    }

    const pg = new PGlite();

    await pg.exec('CREATE TABLE "item" ("id" INTEGER NOT NULL PRIMARY KEY, "name" VARCHAR NOT NULL);');

    await expect(PGLiteConnection.new([ Item ], pg).sync(false)).resolves.toBeDefined();
  });

  it('will ignore missing column if marked as optional', async () => {
    class Item extends Type {
      name = str();
      note = str({ optional: true });
    }

    const pg = new PGlite();

    await pg.exec('CREATE TABLE "item" ("id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "name" TEXT NOT NULL);');
    await PGLiteConnection.new([ Item ], pg).sync(false);

    const field = Item.fields.get("note")!;

    expect(field.absent).toBe(true);
    expect(field.get("x")).toBeUndefined();
  });

  it('will throw for each mismatched column', async () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      title = str();
      rank = num();
      author = one(Author);
      editor = one(Author, { column: "editor_id" });
    }

    const pg = new PGlite();

    await pg.exec(`
      CREATE TABLE "author" ("other" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL);
      CREATE TABLE "post" (
        "id" INTEGER NOT NULL PRIMARY KEY,
        "title" TEXT,
        "rank" TEXT NOT NULL,
        "author_id" INTEGER NOT NULL,
        "editor_id" INTEGER NOT NULL
      );
    `);

    await expect(PGLiteConnection.new([ Post, Author ], pg).sync(false)).rejects.toThrow(
      'Schema verification failed:\n' +
      'Column "title" in table post has incorrect nullable value\n' +
      'Column "rank" in table post has type "text", expected "integer"\n' +
      'Referenced column id does not exist in table author\n' +
      'Referenced column id does not exist in table author\n' +
      'Column "id" does not exist in table author'
    );
  });

  it('will throw for a reference to another connection', async () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(Author);
    }

    const pg = new PGlite();

    await pg.exec('CREATE TABLE "post" ("id" INTEGER NOT NULL PRIMARY KEY, "author_id" INTEGER NOT NULL);');

    await expect(PGLiteConnection.new([ Post ], pg).sync(false)).rejects.toThrow(
      'Column "author_id" in table post references a foreign connection'
    );
  });

  it('will throw for a missing referenced table', async () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(Author);
    }

    const pg = new PGlite();

    await pg.exec('CREATE TABLE "post" ("id" INTEGER NOT NULL PRIMARY KEY, "author_id" INTEGER NOT NULL);');

    await expect(PGLiteConnection.new([ Post, Author ], pg).sync(false)).rejects.toThrow(
      'Referenced table author does not exist'
    );
  });

  it('will throw for several missing tables', async () => {
    class Foo extends Type {}
    class Bar extends Type {}

    await expect(PGLiteConnection.new([ Foo, Bar ], new PGlite()).sync(false)).rejects.toThrow(
      'Tables foo, bar are expected but do not exist.'
    );
  });

  it('will throw if already active', async () => {
    class Foo extends Type {}

    const conn = await PGLiteConnection.new([ Foo ], new PGlite());

    await expect(conn.sync()).rejects.toThrow('Connection is already active.');
  });
});

describe("schema", () => {
  it("will create a table", async () => {
    class Users extends Type {
      name = str();
      email = str();
      age = num();
    }
  
    await TestConnection.new([ Users ]);
  
    await Users.insert({
      name: "Gabe",
      email: "gabe@email.org",
      age: 25
    });
  })
  
  it("will convert camelCase names to underscore", async () => {
    class FooBar extends Type {
      fooBar = bool();
    }
  
    const conn = TestConnection.new({ FooBar });
  
    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "foo_bar" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "foo_bar" BOOLEAN NOT NULL
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
  
    const conn = await TestConnection.new({ Foo, Bar });
  
    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "foo" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "bar_id" INTEGER NOT NULL
        );

      CREATE TABLE
        "bar" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "value" INTEGER NOT NULL
        );

      ALTER TABLE
        "foo" ADD CONSTRAINT "foo_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "bar" ("id");"
    `);
  });
});

describe("types", () => {
  it("will insert and retrieve a Bool", async () => {
    class Test extends Type {
      value1 = bool();
      value2 = bool({
        type: "varchar",
        either: ["YES", "NO"]
      });
    }

    const conn = await TestConnection.new({ Test });

    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "test" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "value1" BOOLEAN NOT NULL,
          "value2" VARCHAR(3) NOT NULL
        );"
    `);

    const insert = Query(where => {
      where(Test, { value1: true, value2: true });
    });

    expect(String(insert)).toMatchInlineSnapshot(`
      "INSERT INTO
        "test" ("value1", "value2")
      SELECT
        TRUE,
        'YES'"
    `);

    await insert;

    const test = await Test.one();

    expect(test.values).toEqual({
      id: 1, value1: true, value2: true
    });
  });

  it("will insert and retrieve a Date", async () => {
    class Test extends Type {
      date = date();
    }

    const conn = await TestConnection.new([ Test ]);

    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "test" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "date" TIMESTAMP NOT NULL
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

  it("will insert and retrieve a time with timezone", async () => {
    class Test extends Type {
      at = date({ type: "time", timezone: true });
    }

    await TestConnection.new([Test]);
    await Test.insert({ at: new Date("1970-01-01T12:34:56Z") });

    const test = await Test.one(1, true);

    expect(test.at).toEqual(new Date("1970-01-01T12:34:56Z"));
  })

  it("will insert and retrieve json", async () => {
    class Test extends Type {
      data = json<{ tags: string[] }>();
    }

    const conn = await TestConnection.new([Test]);

    expect(String(conn.schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "test" (
          "id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "data" TEXT NOT NULL
        );"
    `);

    await Test.insert({ data: { tags: ["a"] } });

    const test = await Test.one(1, true);

    expect(test.data).toEqual({ tags: ["a"] });
  })
})

describe("select", () => {
  class Foo extends Type {
    bar = str();
    baz = str();
  }

  async function prepare(){
    await TestConnection.new({ Foo });
    await Foo.insert({ bar: "hello", baz: "world" });
  }

  it("will select via object", async () => {
    await prepare();
    
    const query = Query(where => {
      const { bar, baz } = where(Foo);
      return { bar, baz }
    })
  
    expect(await query).toEqual([
      { bar: "hello", baz: "world" }
    ]);
  })
  
  it("will output nested object", async () => {
    await prepare();
    
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
    await prepare();
    
    const query = Query(where => {
      return where(Foo).bar;
    })

    expect(await query).toEqual(["hello"]);
  })
  
  it("will select a entire entity", async () => {
    await prepare();
    
    const query = Query(where => {
      return where(Foo);
    })

    const [foo] = await query;

    expect(foo).toBeInstanceOf(Foo);
    expect(foo.values).toEqual({ id: 1, bar: "hello", baz: "world" });
  })

  it("will select without tables", async () => {
    const conn = await TestConnection.new([]);
    const query = Query(where => {
      where.connection = conn;

      return {
        foo: 5,
        bar: "hello",
      }
    });
    
    // TODO: Query has no fallback connection without tables.
    expect(await query).toEqual([{ foo: 5, bar: "hello" }]);
  })
})

describe("template", () => {
  class Foo extends Type {
    first = str();
    last = str();
    color = str();
  }

  async function prepare(){
    await TestConnection.new([Foo]);
    await Query(where => {
      where(Foo,
        { first: "John", last: "Doe",   color: "red" },
        { first: "Jane", last: "Smith", color: "blue" }
      );
    });
  }

  it("will create a template", async () => {
    await prepare();

    const query = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).equal(color);
      return foo.first;
    });
  
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        "foo"."first"
      FROM
        "foo"
      WHERE
        "foo"."color" = $1"
    `);
  
    expect(await query("red")).toEqual(["John"]);
    expect(await query("blue")).toEqual(["Jane"]);
  })
  
  it("will preserve params order", async () => {
    await prepare();

    const query = Query(where => (
      color: string, firstname: string
    ) => {
      const foo = where(Foo);
  
      // Should sorts parameters by order of
      // usage despite the order of arguments.
      where(foo.first).equal(firstname);
      where(foo.color).equal(color);
      
      return foo.last;
    });
  
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        "foo"."last"
      FROM
        "foo"
      WHERE
        "foo"."first" = $1
        AND "foo"."color" = $2"
    `);

    const getJohn = query("red", "John");

    expect(getJohn.params).toEqual([ "John", "red"]);
  
    expect(await getJohn).toEqual(["Doe"]);

    expect(await query("blue", "Jane")).toEqual(["Smith"]);
  })
  
  it("will select a parameter value", async () => {
    const conn = await TestConnection.new([]);
    const query = Query(where => {
      where.connection = conn;
      return (color: string) => color;
    });
  
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        $1"
    `);

    expect(await query("red")).toEqual(["red"]);
  });

  it("will select a parameter in property", async () => {
    const conn = await TestConnection.new([]);
    const query = Query(where => {
      where.connection = conn;
      return (color: string) => ({ color });
    });
  
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        $1 AS "color""
    `);
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
    
    await TestConnection.new({ Users });
  
    const names = ["john", "jane", "bob", "alice"];
    const insert = Query(where => {
      where(Users, ...names.map((name, i) => ({
        name,
        age: i + 25,
        email: `${name.toLowerCase()}@email.org`
      })));
    });
  
    expect(String(insert)).toMatchInlineSnapshot(`
      "INSERT INTO
        "users" ("name", "email", "age")
      SELECT
        "input"."name",
        "input"."email",
        "input"."age"
      FROM
        JSON_TO_RECORDSET($1) AS "input" ("name" TEXT, "email" TEXT, "age" INTEGER)"
    `);
  
    expect<unknown>(insert.params).toEqual([
      [
        {"name": "john",  "email": "john@email.org",  "age": 25 },
        {"name": "jane",  "email": "jane@email.org",  "age": 26 },
        {"name": "bob",   "email": "bob@email.org",   "age": 27 },
        {"name": "alice", "email": "alice@email.org", "age": 28 }
      ]
    ])
  
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

describe("query", () => {
  class User extends Type {
    name = str();
  }

  it("will insert a single row", async () => {
    await TestConnection.new([User]);
    
    const query = Query(where => {
      return where(User, { name: "John" }).id;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        "user" ("name")
      SELECT
        'John'
      RETURNING
        "user"."id""
    `);

    expect(await query).toEqual([1]);
  });

  it.skip("will chain inserts", async () => {
    class Info extends Type {
      user = one(User);
      color = str();
    }

    await TestConnection.new([User, Info]);
    
    const query = Query(where => {
      const user = where(User, { name: "John" });
      const info = where(Info, { user: user.id, color: "blue" });

      return {
        user: user.id,
        info: info.id
      }
    });

    expect(String(query)).toMatchInlineSnapshot(`
      WITH new_user AS (
        INSERT INTO "user" ("name")
        VALUES ('John')
        RETURNING "id"
      ),
      new_info AS (
        INSERT INTO "info" ("user_id", "color")
        SELECT "id", 'blue'
        FROM new_user
        RETURNING "id"
      )
      SELECT 
        new_user.id AS "user",
        new_info.id AS "info"
      FROM new_user, new_info;
    `);
  });
  
  it("will insert", async () => {
    class Info extends Type {
      user = one(User);
      color = str();
    }
  
    await TestConnection.new([User, Info]);
  
    await Query(where => {
      where(User, { name: "John" }, { name: "Jane" }, { name: "Joe" });
    });

    const query = Query(where => {
      const user = where(User);
      const info = where(Info, {
        user: user.id,
        color: "blue",
      });
  
      return info.id;
    });
  
    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        "info" ("user_id", "color")
      SELECT
        "user"."id",
        'blue'
      FROM
        "user"
      RETURNING
        "info"."id""
    `);

    expect(await query).toEqual([1, 2, 3]);
  });

  it("will insert iterable data", async () => {
    await TestConnection.new([User]);
  
    const data = [
      { name: "John" },
      { name: "Jane" },
      { name: "Joe" },
    ]
  
    const query = Query(where => {
      where(User, ...data);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        "user" ("name")
      SELECT
        "input"."name"
      FROM
        JSON_TO_RECORDSET($1) AS "input" ("name" TEXT)"
    `);

    expect(await query).toBe(3);

    const users = await User.query();

    expect(users.map(user => user.values)).toEqual([
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
      { id: 3, name: "Joe" },
    ]);
  });
})

it("will update from data", async () => {
  class Users extends Type {
    name = str();
    age = num();
  }

  await TestConnection.new([Users]);

  await Query(where => {
    where(Users,
      { name: "John", age: 0 },
      { name: "Jane", age: 0 },
      { name: "Joe", age: 0 },
    );
  });

  const data = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  const query = Query(where => {
    const { age, name } = where(data);
    const user = where(Users);

    where(user.name).equal(name);
    where(user).update({ age });
  });

  expect(String(query)).toMatchInlineSnapshot(`
    "WITH
      "input" AS (
        SELECT
          *
        FROM
          JSON_TO_RECORDSET($1) AS x ("age" INTEGER, "name" TEXT)
      )
    UPDATE
      "users"
    SET
      "age" = "input"."age"
    FROM
      "input"
    WHERE
      "users"."name" = "input"."name""
  `);

  expect(await query).toBe(2);
  const users = await Users.find({ id: asc() });

  expect(users.map(user => user.values)).toEqual([
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
    author = one(Author, { onDelete: "CASCADE" });
    title = str();
    views = num({ fallback: 0 });
    draft = bool();
    published = date({ nullable: true, timezone: true });
  }

  it("will round trip entities", async () => {
    await TestConnection.new([Author, Post]);

    const gabe = await Author.insert({ name: "Gabe" });
    const first = await Post.insert({ author: gabe, title: "First", draft: false, published: new Date("2024-01-01T00:00:00Z") });
    const second = await Post.insert({ author: gabe.id, title: "Second", draft: true });

    expect(first.id).toBe(1);
    expect(second.views).toBe(0);
    expect(second.published).toBeUndefined();
    expect(first.published).toEqual(new Date("2024-01-01T00:00:00Z"));

    expect(await Post.find({ draft: true })).toEqual([second]);

    const found = await Post.find({
      title: [isLike("%S%"), notNull()],
      views: greaterThan(-1),
      id: [isIn([1, 2]), asc()]
    }, 1);

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

    await Author.update(gabe.id, { name: "Bob" });

    const [renamed] = await Query(where => where(Author).name);

    expect(renamed).toBe("Bob");
  })
})

describe("live rows", () => {
  it("will update a loaded entity", async () => {
    class User extends Type {
      name = str();
    }

    await TestConnection.new([User]);

    const user = await User.insert({ name: "Gabe" });
    const names: string[] = [];

    user.get(current => {
      names.push(current.name);
    });

    await shared.query(`UPDATE "user" SET name = 'Bob' WHERE id = $1`, [user.id]);
    await vi.waitFor(() => expect(user.name).toBe("Bob"));

    expect(names).toEqual(["Gabe", "Bob"]);
  })

  it("will destroy a deleted entity", async () => {
    class User extends Type {
      name = str();
    }

    await TestConnection.new([User]);

    const user = await User.insert({ name: "Gabe" });

    await shared.query(`DELETE FROM "user" WHERE id = $1`, [user.id]);
    await vi.waitFor(() => expect(user.get(null)).toBe(true));

    expect(User.loaded.has(user.id)).toBe(false);
  })

  it("will keep unsaved fields", async () => {
    class User extends Type {
      name = str();
      age = num();
    }

    await TestConnection.new([User]);

    const user = await User.insert({ name: "Gabe", age: 1 });

    user.name = "Local";

    await shared.query(`UPDATE "user" SET name = 'Remote', age = 30 WHERE id = $1`, [user.id]);
    await vi.waitFor(() => expect(user.age).toBe(30));

    expect(user.name).toBe("Local");
  })

  it("will decode a timestamp", async () => {
    class Event extends Type {
      at = date();
    }

    await TestConnection.new([Event]);

    const event = await Event.insert({ at: new Date("2024-01-01T00:00:00Z") });

    await shared.query(`UPDATE "event" SET at = '2024-06-01 12:00:00' WHERE id = $1`, [event.id]);
    await vi.waitFor(() => expect(event.at).toEqual(new Date("2024-06-01T12:00:00Z")));
  })

  it("will reload a row too large to notify", async () => {
    class Doc extends Type {
      body = str();
    }

    await TestConnection.new([Doc]);

    const doc = await Doc.insert({ body: "short" });
    const body = "x".repeat(9000);

    await shared.query(`UPDATE "doc" SET body = $1 WHERE id = $2`, [body, doc.id]);
    await vi.waitFor(() => expect(doc.body).toBe(body));
  })

  it("will follow a renamed key column", async () => {
    class User extends Type {
      id = num({ column: "user_id", primary: true });
      name = str();
    }

    await TestConnection.new([User]);

    const user = await User.insert({ id: 7, name: "Gabe" });

    await shared.query(`UPDATE "user" SET name = 'Bob' WHERE user_id = 7`);
    await vi.waitFor(() => expect(user.name).toBe("Bob"));
  })

  it("will ignore tables not used", async () => {
    class User extends Type {
      name = str();
    }

    const db = await TestConnection.new([User]);
    const listener = vi.fn();
    const stop = db.subscribe(listener);

    await shared.query(`SELECT pg_notify('expressive_orm', '{"table":"other","op":"delete","id":1}')`);
    await shared.query(`SELECT pg_notify('expressive_orm', '{"table":"user","op":"delete","id":1}')`);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    stop();

    expect(listener).toHaveBeenCalledWith({ table: "user", op: "delete", id: 1 });
  })
})

describe("renamed key column", () => {
  it("will round trip a numeric key", async () => {
    class User extends Type {
      id = num({ column: "user_id", primary: true });
      name = str();
    }

    const db = await TestConnection.new([User]);
    const user = await User.insert({ id: 1, name: "Gabe" });

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

  it("will accept an explicit generated id", async () => {
    class User extends Type {
      name = str();
    }

    await TestConnection.new([User]);

    const user = await User.insert({ id: 5, name: "Gabe" });

    expect(user.id).toBe(5);
    await expect(User.one(5, true)).resolves.toBe(user);
  })
})

it.todo("will prevent reserved words as table names", () => {});
it.todo("will handle type synonyms", () => {});
