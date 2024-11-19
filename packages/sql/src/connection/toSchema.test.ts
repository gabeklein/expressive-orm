import knex from "knex";
import { createTable } from "./toSchema";
import { Type } from "../Type";
import { Bool, Num, One } from "../columns";

it.todo("will check FK constraints");

function toSchema(types: Type.EntityType[]) {
  const sqlite = knex({
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: { filename: ':memory:' }
  });

  const builder = sqlite.schema;

  types.forEach(createTable, builder);

  return builder.toString();
}

it("will convert camelCase names to underscore", async () => {
  class FooBar extends Type {
    fooBar = Bool();
  }

  const sql = toSchema([FooBar]);

  expect(sql).toMatchInlineSnapshot(`
    create table
      \`foo_bar\` (
        \`id\` integer not null primary key autoincrement,
        \`foo_bar\` tinyint not null
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
    create table
      \`foo\` (
        \`id\` integer not null primary key autoincrement,
        \`bar_id\` int not null,
        foreign key (\`bar_id\`) references \`bar\` (\`id\`)
      );

    create table
      \`bar\` (
        \`id\` integer not null primary key autoincrement,
        \`value\` int not null
      )
  `);
});