import { Entity, Int, Select, Table, VarChar } from '..';

class Foo extends Entity {
  name = VarChar();
  color = VarChar({
    oneOf: ["red", "blue", "green"]
  });
}

it("will group where clauses", async () => {
  const query = new Select(where => {
    const foo = where(Foo);

    where.any(
      where(foo.name).not("Danny"),
      where(foo.color).is("red"),
      where.all(
        where(foo.name).is("Gabe"),
        where(foo.color).is("green")
      )
    );

    return foo.name;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
WHERE
  \`Foo\`.\`name\` <> 'Danny'
  OR \`Foo\`.\`color\` = 'red'
  OR (
    \`Foo\`.\`name\` = 'Gabe'
    AND \`Foo\`.\`color\` = 'green'
  )
`);
})

it("will match values via objects", () => {
  const query = new Select(where => {
    const foo = where(Foo);

    where(foo).has({
      name: "Gabe",
      color: "blue"
    })

    return foo.name;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
WHERE
  \`Foo\`.\`name\` = 'Gabe'
  AND \`Foo\`.\`color\` = 'blue'
`)
})

it("will group multiple clauses", async () => {
  const query = new Select(where => {
    const foo = where(Foo);

    where.any(
      where.all(
        where(foo.name).not("Danny"),
        where(foo.color).is("red"),
      ),
      where.all(
        where(foo.name).is("Gabe"),
        where(foo.color).is("green")
      )
    );

    return foo.name;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
WHERE
  (
    \`Foo\`.\`name\` <> 'Danny'
    AND \`Foo\`.\`color\` = 'red'
  )
  OR (
    \`Foo\`.\`name\` = 'Gabe'
    AND \`Foo\`.\`color\` = 'green'
  )
`);
})

it("will join using single query syntax", async () => {
  class Bar extends Entity {
    name = VarChar();
    color = VarChar();
    rating = Int();
  }
  
  class Baz extends Entity {
    rating = Int();
  }

  const query = new Select(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, "left", { rating: bar.rating });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);

    return {
      fooValue: foo.name,
      barValue: bar.name,
      bazRating: baz.rating
    }
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`fooValue\`,
  \`Bar\`.\`name\` AS \`barValue\`,
  \`Baz\`.\`rating\` AS \`bazRating\`
FROM
  \`Foo\`
  INNER JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
  LEFT JOIN \`Baz\` ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
WHERE
  \`Foo\`.\`name\` <> 'Danny'
  AND \`Bar\`.\`rating\` > 50
`);
})

it("will alias tables with a schema", () => {
  class Foo extends Entity {
    table = Table({
      schema: "foobar",
      name: "foo"
    })

    name = VarChar();
    color = VarChar();
  }

  const query = new Select(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
    
    return () => foo.name;
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
