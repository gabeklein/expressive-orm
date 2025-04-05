import { Query, Str, Table } from '..';

class Foo extends Table {
  bar = Str();
  baz = Str();
}

it("will count query by default", () => {
  class Foo extends Table {}

  const query = Query(where => void where(Foo));

  expect(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foo
  `);
})

it("will select without tables", () => {
  const query = Query(() => {
    return {
      foo: 5,
      bar: "hello",
    }
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      5 AS "foo",
      'hello' AS "bar"
  `);
})

it("will select via object", () => {
  const query = Query(where => {
    const { bar, baz } = where(Foo);

    return { bar, baz }
  })

  type Returns = Query.Selects<{
    bar: string;
    baz: string;
  }>

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.bar AS "bar",
      foo.baz AS "baz"
    FROM
      foo
  `);
})

it("will output nested object", () => {
  const query = Query(where => {
    const { bar, baz } = where(Foo);

    return {
      bar: { value: bar },
      baz: { value: baz }
    }
  })

  type Returns = Query.Selects<{
    bar: { value: string };
    baz: { value: string };
  }>

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.bar AS "bar.value",
      foo.baz AS "baz.value"
    FROM
      foo
  `);
})

it("will select a field directly", () => {
  const query = Query(where => {
    return where(Foo).bar;
  })

  type Returns = Query.Selects<string>;

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.bar
    FROM
      foo
  `);
})

it("will select a entire entity", () => {
  const query = Query(where => {
    return where(Foo);
  })

  type Returns = Query.Selects<{
    id: number;
    bar: string;
    baz: string;
  }>

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.id AS "id",
      foo.bar AS "bar",
      foo.baz AS "baz"
    FROM
      foo
  `);
})