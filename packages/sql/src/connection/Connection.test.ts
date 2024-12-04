import { Type } from "../Type";
import { Bool, Num, One } from "../columns";
import { Connection } from "./Connection";

it.todo("will check FK constraints");

function toSchema(types: Type.EntityType[]) {
  const connection = new Connection({
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: { filename: ':memory:' }
  });

  return connection.schema(types).toString();
}

it("will convert camelCase names to underscore", async () => {
  class FooBar extends Type {
    fooBar = Bool();
  }

  const sql = toSchema([FooBar]);

  expect(sql).toMatchInlineSnapshot(`
    CREATE TABLE
      foo_bar (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        foo_bar tinyint NOT NULL
      )
  `);
});

it("will create FK constraints", async () => {
  class Foo extends Type {
    bar = One(Bar);
  }

  class Bar extends Type {
    value = Num();
  }

  const sql = toSchema([Foo, Bar]);

  expect(sql).toMatchInlineSnapshot(`
    CREATE TABLE
      foo (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        bar_id int NOT NULL,
        FOREIGN KEY (bar_id) REFERENCES bar (id)
      );

    CREATE TABLE
      bar (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        value int NOT NULL
      )
  `);
});