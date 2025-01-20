import { Num, Query, Str, Type } from '..';

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
    const bar = where(Bar);

    where(bar.color).is(foo.color);
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

  const query = Query.from(data, (where, input) => {
    const user = where(User);

    where(user.name).is(input.name);
    where(user).update({ age: input.age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
      input AS (
        SELECT
          VALUE -> 0 AS name,
          VALUE -> 1 AS age
        FROM
          json_each (?)
      )
    UPDATE
      USER
      INNER JOIN input ON USER.name = input.name
    SET
      age = input.age
  `)
})

it.todo('will update multiple tables')