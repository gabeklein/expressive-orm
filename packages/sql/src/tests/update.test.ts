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

    where(foo.color).is("red");
    where(foo).update({
      value: "new!",
      color: "blue"
    })
  });

  expect(query).toMatchInlineSnapshot(`
    UPDATE
      foo
    SET
      value = 'new!',
      color = 'blue'
    WHERE
      foo.color = 'red'
  `);
})

it("will update with joins", () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(foo.color).is("red");
    where(foo).update({ value: bar.value });
  });

  expect(query).toMatchInlineSnapshot(`
    UPDATE
      foo
      INNER JOIN bar ON bar.color = foo.color
    SET
      value = bar.value
    WHERE
      foo.color = 'red'
  `);
})

it("will complain about nullable mismatch", () => {
  class Baz extends Type {
    nullable = Str({ nullable: true });
    nonNullable = Str();
  }
  
  const query = Query(where => {
    const baz = where(Baz);
    where(baz).update({ nullable: null });
  });

  expect(query).toMatchInlineSnapshot(`
    UPDATE
      baz
    SET
      nullable = NULL
  `);

  const badQuery = () => Query(where => {
    const baz = where(Baz);
    // @ts-expect-error
    where(baz).update({ nonNullable: null });
  })

  expect(badQuery).toThrowErrorMatchingInlineSnapshot(
    `Column baz.non_nullable is not nullable.`
  );
})

it.todo('will update multiple tables')