import { Query, Str, Table } from '..';

class Foo extends Table {
  value = Str();
  color = Str();
}

class Bar extends Table {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.value).equal("Hello World!");
    where(foo).delete();
  });

  expect(query).toMatchInlineSnapshot(`
    DELETE FROM
      foo
    WHERE
      foo.value = 'Hello World!'
  `);
})

it("will include FROM statement where JOIN exists", () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);

    where(bar.color).equal(foo.color);
    where(bar.value).equal("Hello World!");

    where(foo).delete();
  });

  expect(query).toMatchInlineSnapshot(`
    DELETE foo
    FROM
      foo
      INNER JOIN bar ON bar.color = foo.color
    WHERE
      bar.value = 'Hello World!'
  `);
})