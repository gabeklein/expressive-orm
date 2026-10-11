import { expect, it } from 'vitest';

import { num, one, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

it("will render a foreign key by its affinity", () => {
  class Author extends Type {
    name = num();
  }

  class Post extends Type {
    author = one(Author);
    editor = one(Author, { type: "bigint", column: "editor_id", nullable: true });
  }

  const { schema } = new TestConnection([ Author, Post ]);

  expect(Post.fields.get("editor")!.datatype).toBe("bigint");
  expect(String(schema)).toMatchInlineSnapshot(`
    "CREATE TABLE
      author (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        name INTEGER NOT NULL
      );

    CREATE TABLE
      post (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        author_id INTEGER NOT NULL REFERENCES author (id),
        editor_id INTEGER REFERENCES author (id)
      );"
  `);
});

it("will reject an unknown type", () => {
  class Author extends Type {}

  class Post extends Type {
    // @ts-expect-error
    author = one(Author, { type: "text" });
  }

  expect(Post).toBeDefined();
});
