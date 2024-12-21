import { Type } from "../Type";
import { Bool, Num, One } from "../columns";
import { Connection } from "./Connection";

it.todo("will check FK constraints");

function toSchema(types: Connection.Types) {
  return new Connection().schema(types);
}

it("will convert camelCase names to underscore", async () => {
  class FooBar extends Type {
    fooBar = Bool();
  }

  const sql = toSchema({ FooBar });

  expect(sql).toMatchInlineSnapshot(`
    CREATE TABLE
      foo_bar (
        id INTEGER NOT NULL PRIMARY key autoincrement,
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

  const sql = toSchema({ Foo, Bar });

  expect(sql).toMatchInlineSnapshot(`
    CREATE TABLE
      foo (
        id INTEGER NOT NULL PRIMARY key autoincrement,
        bar_id INT NOT NULL,
        FOREIGN key (bar_id) REFERENCES bar (id)
      );

    CREATE TABLE
      bar (
        id INTEGER NOT NULL PRIMARY key autoincrement,
        value INT NOT NULL
      )
  `);
});