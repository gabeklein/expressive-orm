import { Primary, Query, Str, Table } from '..';

it("will alias types with a schema", () => {
  class Foo extends Table {
    id = Primary({
      tableSchema: "foobar",
    });

    name = Str();
    color = Str();
  }

  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).equal("red");
  })

  expect(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foobar.foo T0
    WHERE
      T0.color = 'red'
  `);
})