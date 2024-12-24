import { Query, Str, Type } from '..';

class Foo extends Type {
  value = Str();
  color = Str();
}

class Bar extends Type {
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
    const bar = where(Bar, { color: foo.color });

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