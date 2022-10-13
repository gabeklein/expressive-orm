import { Entity, Int, Query, Table, VarChar } from '../src';

class Foo extends Entity {
  name = VarChar();
  color = VarChar();
}

it("will join using single query syntax", async () => {
  class Bar extends Entity {
    name = VarChar();
    color = VarChar();
    rating = Int();
  }
  
  class Baz extends Entity {
    color = VarChar();
    rating = Int();
  }

  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, { rating: bar.rating });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);
    where(baz.color).is("blue");
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  COUNT(*)
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
  JOIN \`Baz\` ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
WHERE
  \`Foo\`.\`name\` <> 'Danny'
  AND \`Bar\`.\`rating\` > 50
  AND \`Baz\`.\`color\` = 'blue'
`);
})

it("will alias tables with a schema", () => {
  class Foo extends Entity {
    this = Table({
      name: "foo",
      schema: "foobar"
    })

    name = VarChar();
    color = VarChar();
  }

  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  })

  expect(query).toMatchInlineSnapshot(`
SELECT
  COUNT(*)
FROM
  \`foobar\`.\`foo\` AS \`$0\`
WHERE
  \`$0\`.\`color\` = 'red'
`);
})