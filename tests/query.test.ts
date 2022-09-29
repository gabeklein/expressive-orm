// @ts-nocheck

import { Entity, Int, Select, Table, VarChar } from '../src';

it("will group where clauses", async () => {
  class Foo extends Entity {
    name = VarChar();
    color = VarChar({
      oneOf: ["red", "blue", "green"]
    });
  }

  const query = new Select(where => {
    const { from, all, any, equal, notEqual } = where;

    const foo = from(Foo);

    any(
      notEqual(foo.name, "Danny"),
      equal(foo.color, "red"),
      all(
        equal(foo.name, "Gabe"),
        equal(foo.color, "green")
      )
    );

    return foo.name;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM \`Foo\`
WHERE
  \`Foo\`.\`name\` <> 'Danny' OR \`Foo\`.\`color\` = 'red' OR (\`Foo\`.\`name\` = 'Gabe' AND \`Foo\`.\`color\` = 'green')
`);
})

it("will join using single query syntax", async () => {
  class Foo extends Entity {
    name = VarChar();
    color = VarChar();
  }

  class Bar extends Entity {
    name = VarChar();
    color = VarChar();
    rating = Int();
  }
  
  class Baz extends Entity {
    rating = Int();
  }

  const query = new Select(where => {
    const foo = where.from(Foo);
    const bar = where.join(Bar);
    const baz = where.join(Baz, "left");

    where.equal(bar.color, foo.color);
    where.equal(baz.rating, bar.rating);

    where.notEqual(foo.name, "Danny");
    where.greater(bar.rating, 50);

    return {
      fooValue: foo.name,
      barValue: bar.name
    }
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`fooValue\`,
  \`Bar\`.\`name\` AS \`barValue\`
FROM \`Foo\`
INNER JOIN \`Bar\`
  ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
LEFT JOIN \`Baz\`
  ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
WHERE
  \`Foo\`.\`name\` <> 'Danny' AND
  \`Bar\`.\`rating\` > 50
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
    const foo = where.from(Foo);

    where.equal(foo.color, "red");
    
    return () => foo.name;
  })

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`$0\`.\`name\` AS \`1\`
FROM \`foobar\`.\`foo\` AS \`$0\`
WHERE
  \`$0\`.\`color\` = 'red'
`);
})
