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
    rating = Int();
  }

  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, "left", { rating: bar.rating });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);

    return where.get({
      fooValue: foo.name,
      barValue: bar.name,
      bazRating: baz.rating
    })
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`fooValue\`,
  \`Bar\`.\`name\` AS \`barValue\`,
  \`Baz\`.\`rating\` AS \`bazRating\`
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
  LEFT JOIN \`Baz\` ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
WHERE
  \`Foo\`.\`name\` <> 'Danny'
  AND \`Bar\`.\`rating\` > 50
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
    
    return where.get(foo.name);
  })

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`$0\`.\`name\` AS \`1\`
FROM
  \`foobar\`.\`foo\` AS \`$0\`
WHERE
  \`$0\`.\`color\` = 'red'
`);
})