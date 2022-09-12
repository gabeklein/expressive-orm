import { Entity, Int, String } from '../src';
import Table from '../src/instruction/Table';
import Query from '../src/Query';

it("will join using single query syntax", async () => {
  class Foo extends Entity {
    name = String();
    color = String();
  }
  
  class Bar extends Entity {
    name = String();
    color = String();
    rating = Int();
  }
  
  class Baz extends Entity {
    rating = Int();
  }

  const query = new Query(where => {
    const foo = where.from(Foo);
    const bar = where.join(Bar);
    const baz = where.join(Baz, "left");

    where.equal(bar.color, foo.color);
    where.equal(baz.rating, bar.rating);

    where.notEqual(foo.name, "Danny");
    where.greater(bar.rating, 50);

    return () => ({
      foo: foo.name,
      bar: bar.name
    })
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`,
  \`Bar\`.\`name\` AS \`2\`
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

    name = String();
    color = String();
  }

  const query = new Query(where => {
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
