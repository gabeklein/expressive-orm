import { Bool, Num, One, Str, Type } from '..';
import { TestConnection } from '../tests';

it.todo("will check FK constraints");

it("will create a table", async () => {
  class User extends Type {
    name = Str();
    email = Str();
    age = Num();
  }

  await new TestConnection([ User ]);

  await User.insert({
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

  const sql = new TestConnection({ Foo, Bar });

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