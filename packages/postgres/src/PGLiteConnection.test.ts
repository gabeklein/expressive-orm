import { Bool, Num, One, Query, Str, Time, Type } from '@expressive/sql';

import { TestConnection } from './TestConnection';

describe("schema", () => {
  it("will create a table", async () => {
    class Users extends Type {
      name = Str();
      email = Str();
      age = Num();
    }
  
    await new TestConnection([ Users ]);
  
    await Users.insert({
      name: "Gabe",
      email: "gabe@email.org",
      age: 25
    });
  })
  
  it("will convert camelCase names to underscore", async () => {
    class FooBar extends Type {
      fooBar = Bool();
    }
  
    const conn = new TestConnection({ FooBar });
  
    expect(conn.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "foo_bar" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "foo_bar" tinyint NOT NULL
        );
    `);
  });
  
  it("will create FK constraints", async () => {
    class Foo extends Type {
      bar = One(Bar);
    }
  
    class Bar extends Type {
      value = Num();
    }
  
    const conn = await new TestConnection({ Foo, Bar });
  
    expect(conn.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "foo" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "bar_id" INTEGER NOT NULL
        );

      CREATE TABLE
        "bar" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "value" INTEGER NOT NULL
        );

      ALTER TABLE
        "foo" ADD CONSTRAINT "foo_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "bar" ("id");
    `);
  });
});

describe.skip("types", () => {
  it("will insert and retrieve a Bool", async () => {
    class Test extends Type {
      value1 = Bool();
      value2 = Bool({
        type: "varchar",
        either: ["YES", "NO"]
      });
    }
  
    const conn = await new TestConnection({ Test });
  
    expect(conn.schema).toMatchInlineSnapshot(
      `CREATE TABLE "test" ("id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE, "value1" tinyint NOT NULL, "value2" TEXT NOT NULL);`
    );
  
    const insert = Test.insert({
      value1: true, value2: true
    });
  
    expect(insert).toMatchInlineSnapshot(`
      INSERT INTO
        test (value1, value2)
      VALUES
        (1, 'YES')
    `);
    
    await insert;
    expect(await Test.one()).toEqual({
      id: 1, value1: true, value2: true
    });
  });

  it("will insert and retrieve a Date", async () => {
    class Test extends Type {
      date = Time();
    }

    const conn = await new TestConnection([ Test ]);

    expect(conn.schema).toMatchInlineSnapshot(
      `CREATE TABLE "test" ("id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE, "date" TIMESTAMP NOT NULL);`
    );
  
    const now = new Date();
  
    // database has limited precision
    now.setMilliseconds(0);
  
    await Test.insert({ date: now })
  
    const date = await Test.one((foo, where) => {
      where(foo.id).is(1);
  
      return foo.date;
    });
  
    // Date type should be preserved
    expect<Date>(date).toBeInstanceOf(Date);
    expect<Date>(date).toEqual(now);
  })
})

describe("select", () => {
  class Foo extends Type {
    bar = Str();
    baz = Str();
  }

  async function prepare(){
    await new TestConnection({ Foo });
    await Foo.insert([
      { bar: "hello", baz: "world" },
    ]);
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

    expect(await query).toEqual([
      { id: 1, bar: "hello", baz: "world" }
    ]);
  })

  it.skip("will select without tables", async () => {
    const query = Query(() => {
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
    first = Str();
    last = Str();
    color = Str();
  }

  async function prepare(){
    await new TestConnection([Foo]);
    await Foo.insert([
      { first: "John", last: "Doe",   color: "red" },
      { first: "Jane", last: "Smith", color: "blue" }
    ]);
  }

  it("will create a template", async () => {
    await prepare();

    const query = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).is(color);
      return foo.first;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        "foo"."first"
      FROM
        "foo"
      WHERE
        "foo"."color" = $1
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
      where(foo.first).is(firstname);
      where(foo.color).is(color);
      
      return foo.last;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        "foo"."last"
      FROM
        "foo"
      WHERE
        "foo"."first" = $1
        AND "foo"."color" = $2
    `);

    const getJohn = query("red", "John");

    expect(getJohn.params).toEqual([ "John", "red"]);
  
    expect(await getJohn).toEqual(["Doe"]);

    expect(await query("blue", "Jane")).toEqual(["Smith"]);
  })
  
  it("will select a parameter value", async () => {
    const query = Query(() => (color: string) => color);
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        ?
    `);

    // TODO: test if comes back as expected
  });
  
  it("will select a parameter value", async () => {
    const query = Query(() => (color: string) => ({ color }));
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        ? AS "color"
    `);
  });
})

it("will insert procedurally generated rows", async () => {
  class Users extends Type {
    name = Str();
    email = Str();
    age = Num();
  }
  
  await new TestConnection({ Users });

  const names = ["john", "jane", "bob", "alice"];
  const insert = Users.insert(names, (name, i) => ({
    name,
    age: i + 25,
    email: `${name.toLowerCase()}@email.org`
  }));

  expect(insert).toMatchInlineSnapshot(`
    INSERT INTO
      "users" ("name", "email", "age")
    SELECT
      "input"."name",
      "input"."email",
      "input"."age"
    FROM
      JSON_TO_RECORDSET($1) AS "input" (
        "name" VARCHAR(255),
        "email" VARCHAR(255),
        "age" INT
      )
  `);

  expect(insert.params).toEqual([
    [
      {"name": "john",  "email": "john@email.org",  "age": 25 },
      {"name": "jane",  "email": "jane@email.org",  "age": 26 },
      {"name": "bob",   "email": "bob@email.org",   "age": 27 },
      {"name": "alice", "email": "alice@email.org", "age": 28 }
    ]
  ])

  await insert;

  const results = Users.get();

  expect(await results).toMatchObject([
    { "id": 1, "name": "john",  "email": "john@email.org",  "age": 25 },
    { "id": 2, "name": "jane",  "email": "jane@email.org",  "age": 26 },
    { "id": 3, "name": "bob",   "email": "bob@email.org",   "age": 27 },
    { "id": 4, "name": "alice", "email": "alice@email.org", "age": 28 }
  ]);
})

describe("query", () => {
  class Users extends Type {
    name = Str();
  }

  it("will insert a single row", async () => {
    await new TestConnection([Users]);
    
    const query = Query(where => {
      return where(Users, { name: "John" }).id;
    });

    expect(query).toMatchInlineSnapshot(`
      INSERT INTO
        "users" ("name")
      SELECT
        'John'
      RETURNING
        "users"."id"
    `);

    expect(await query).toEqual([1]);
  });

  it.skip("will chain inserts", async () => {
    class Info extends Type {
      user = One(Users);
      color = Str();
    }

    await new TestConnection([Users, Info]);
    
    const query = Query(where => {
      const user = where(Users, { name: "John" });
      const info = where(Info, { user: user.id, color: "blue" });

      return {
        user: user.id,
        info: info.id
      }
    });

    expect(query).toMatchInlineSnapshot(`
      WITH new_user AS (
        INSERT INTO "users" ("name")
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
      user = One(Users);
      color = Str();
    }
  
    await new TestConnection([Users, Info]);
  
    await Users.insert([
      { name: "John" },
      { name: "Jane" },
      { name: "Joe" },
    ]);
  
    const query = Query(where => {
      const user = where(Users);
      const info = where(Info, {
        user: user.id,
        color: "blue",
      });
  
      return info.id;
    });
  
    expect(query).toMatchInlineSnapshot(`
      INSERT INTO
        "info" ("user_id", "color")
      SELECT
        "users"."id",
        'blue'
      FROM
        "users"
      RETURNING
        "info"."id"
    `);

    expect(await query).toEqual([1, 2, 3]);
  });

  it("will insert iterable data", async () => {
    await new TestConnection([Users]);
  
    const data = [
      { name: "John" },
      { name: "Jane" },
      { name: "Joe" },
    ]
  
    const query = Query(where => {
      where(Users, ...data);
    });

    expect(query).toMatchInlineSnapshot(`
      INSERT INTO
        "users" ("name")
      SELECT
        "input"."name"
      FROM
        JSON_TO_RECORDSET($1) AS "input" ("name" VARCHAR(255))
    `);

    expect(await query).toBe(3);

    expect(await Users.get()).toEqual([
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
      { id: 3, name: "Joe" },
    ]);
  });
})

it("will update from data", async () => {
  class Users extends Type {
    name = Str();
    age = Num();
  }

  await new TestConnection([Users]);

  await Users.insert([
    { name: "John", age: 0 },
    { name: "Jane", age: 0 },
    { name: "Joe", age: 0 },
  ])

  const data = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  const query = Query(where => {
    const { age, name } = where(data);
    const user = where(Users);

    where(user.name).is(name);
    where(user).update({ age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
      "input" AS (
        SELECT
          *
        FROM
          JSON_TO_RECORDSET($1) AS x ("age" INT, "name" VARCHAR(255))
      )
    UPDATE
      "users"
    SET
      "age" = "input"."age"
    FROM
      "input"
    WHERE
      "users"."name" = "input"."name"
  `);

  expect(await query).toBe(2);
  expect(await Users.get()).toEqual([
    { id: 3, name: "Joe", age: 0 },
    { id: 1, name: "John", age: 30 },
    { id: 2, name: "Jane", age: 25 },
  ]);
})

it.todo("will prevent reserved words as table names");