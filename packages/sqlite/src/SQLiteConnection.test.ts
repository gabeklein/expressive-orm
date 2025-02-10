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
  
    expect(sql.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        foo_bar (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          foo_bar tinyint NOT NULL
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
  
    const sql = new TestConnection({ Foo, Bar });
  
    expect(sql.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        foo (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          bar_id INTEGER NOT NULL REFERENCES bar (id)
        );

      CREATE TABLE
        bar (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          value INTEGER NOT NULL
        );
    `);
  });
});

describe("types", () => {
  it("will insert and retrieve a Bool", async () => {
    class Test extends Type {
      value1 = Bool();
      value2 = Bool({
        type: "varchar",
        either: ["YES", "NO"]
      });
    }
  
    const conn = await new TestConnection([Test]);
  
    expect(conn.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        test (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          value1 tinyint NOT NULL,
          value2 TEXT NOT NULL
        );
    `);
  
    const insert = Test.insert({
      value1: true, value2: true
    });
  
    expect(insert).toMatchInlineSnapshot(`
      INSERT INTO
        test (value1, value2)
      SELECT
        1,
        'YES'
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

    expect(conn.schema).toMatchInlineSnapshot(`
      CREATE TABLE
        test (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          date TEXT NOT NULL
        );
    `);
  
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
  
  new TestConnection({ Foo }, async () => {
    await Foo.insert([
      { bar: "hello", baz: "world" },
    ]);
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

  new TestConnection([Foo], async () => {
    await Foo.insert([
      { first: "John", last: "Doe",   color: "red" },
      { first: "Jane", last: "Smith", color: "blue" },
    ])
  });

  it("will create a template", async () => {
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
        foo.color = ?
    `);
  
    expect(await query("red")).toEqual(["John"]);
    expect(await query("blue")).toEqual(["Jane"]);
  })
  
  it("will preserve params order", async () => {
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
        foo.first = ?
        AND foo.color = ?
    `);
  
    expect(await query("red", "John")).toEqual(["Doe"]);
    expect(await query("blue", "Jane")).toEqual(["Smith"]);
  })
  
  it("will select a parameter value", async () => {
    const conn = await new TestConnection([]);
    const query = Query(function(){
      // TODO: assign connection to Query itself?
      this.connection = conn as any;
      return (color: string) => color;
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        ?
    `);

    expect(await query("red")).toEqual(["red"]);
  });
  
  it("will select a parameter in property", async () => {
    const conn = await new TestConnection([]);
    const query = Query(function(){
      this.connection = conn as any;
      return (color: string) => ({ color })
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        ? AS "color"
    `);

    expect(await query("red")).toEqual([{ color: "red" }]);
  });
})

it("will insert procedurally generated rows", async () => {
  class Users extends Type {
    name = Str();
    email = Str();
    age = Num();
  }
  
  await new TestConnection([Users]);

  const names = ["john", "jane", "bob", "alice"];
  const insert = Users.insert(names, (name, i) => ({
    name,
    age: i + 25,
    email: `${name.toLowerCase()}@email.org`
  }));

  expect(insert).toMatchInlineSnapshot(`
    WITH
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
      input
  `);

  await insert;

  const results = Users.get();

  expect(await results).toMatchObject([
    { "id": 1, "name": "john",  "email": "john@email.org",  "age": 25 },
    { "id": 2, "name": "jane",  "email": "jane@email.org",  "age": 26 },
    { "id": 3, "name": "bob",   "email": "bob@email.org",   "age": 27 },
    { "id": 4, "name": "alice", "email": "alice@email.org", "age": 28 }
  ]);
})

it("will update from data", async () => {
  class User extends Type {
    name = Str();
    age = Num();
  }

  interface Data {
    name: string;
    age: number;
  }

  const data: Data[] = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  await new TestConnection([User]);

  await User.insert([
    { name: "John", age: 0 },
    { name: "Jane", age: 0 },
    { name: "Joe", age: 0 },
  ])

  const query = Query(where => {
    const { name, age } = where(data);
    const user = where(User);

    where(user.name).is(name);
    where(user).update({ age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
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
      user.name = input.name
  `)

  expect(await query).toBe(2);

  const results = await User.get();
  
  expect(results).toEqual([
    { id: 1, name: "John", age: 30 },
    { id: 2, name: "Jane", age: 25 },
    { id: 3, name: "Joe", age: 0 },
  ]);
})