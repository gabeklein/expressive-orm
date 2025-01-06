import { Query, Str, Table, Type } from '..';
it("will alias types with a schema", () => {
  class Foo extends Type {
    this = Table({ schema: "foobar" });

    name = Str();
    color = Str();
  }

  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
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