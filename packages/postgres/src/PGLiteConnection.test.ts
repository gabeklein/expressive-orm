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
  
    const sql = new TestConnection({ FooBar });
  
    expect(sql.schema).toMatchInlineSnapshot(
      `CREATE TABLE "foo_bar" ("id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE, "foo_bar" tinyint NOT NULL);`
    );
  });
  
  it("will create FK constraints", async () => {
    class Foo extends Type {
      bar = One(Bar);
    }
  
    class Bar extends Type {
      value = Num();
    }
  
    const sql = new TestConnection({ Foo, Bar });
  
    expect(sql.schema).toMatchInlineSnapshot(`
      CREATE TABLE "foo" ("id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE, "bar_id" INTEGER NOT NULL);
      CREATE TABLE "bar" ("id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE, "value" INTEGER NOT NULL);
      ALTER TABLE "foo" ADD CONSTRAINT "foo_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "bar"("id");
    `);

    await sql;
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
  
    const conn = await new TestConnection([Test]);
  
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
    await expect(Test.one()).resolves.toEqual({
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
  
    await expect(query).resolves.toEqual([
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
  
    await expect(query).resolves.toEqual([{
      bar: { value: "hello" }, 
      baz: { value: "world" }
    }]);
  })
  
  it("will select a field directly", async () => {
    await prepare();
    
    const query = Query(where => {
      const { bar } = where(Foo);
      return bar;
    })

    await expect(query).resolves.toEqual(["hello"]);
  })
  
  it("will select a entire entity", async () => {
    await prepare();
    
    const query = Query(where => {
      return where(Foo);
    })

    await expect(query).resolves.toEqual([
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
    await expect(query).resolves.toEqual([{ foo: 5, bar: "hello" }]);
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
        foo.first
      FROM
        foo
      WHERE
        "foo"."color" = $1
    `);
  
    await expect(query("red")).resolves.toEqual(["John"]);
    await expect(query("blue")).resolves.toEqual(["Jane"]);
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
        foo.last
      FROM
        foo
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
        ? AS VALUE
    `);
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
      users (name, email, age)
    VALUES
      ('john', 'john@email.org', 25),
      ('jane', 'jane@email.org', 26),
      ('bob', 'bob@email.org', 27),
      ('alice', 'alice@email.org', 28)
  `);

  await insert;

  const results = Users.get();

  await expect(results).resolves.toMatchObject([
    { "id": 1, "name": "john",  "email": "john@email.org",  "age": 25 },
    { "id": 2, "name": "jane",  "email": "jane@email.org",  "age": 26 },
    { "id": 3, "name": "bob",   "email": "bob@email.org",   "age": 27 },
    { "id": 4, "name": "alice", "email": "alice@email.org", "age": 28 }
  ]);
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

  const query = Query.from(data, (where, input) => {
    const user = where(Users);

    where(user.name).is(input.name);
    where(user).update({ age: input.age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
      "input" AS (
        SELECT
          *
        FROM
          JSON_TO_RECORDSET($1) AS x (NAME VARCHAR(255), age INT)
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

  await expect(query).resolves.toBe(2);
  await expect(Users.get()).resolves.toEqual([
    { id: 3, name: "Joe", age: 0 },
    { id: 1, name: "John", age: 30 },
    { id: 2, name: "Jane", age: 25 },
  ]);
})

it.todo("will prevent reserved words as table names");