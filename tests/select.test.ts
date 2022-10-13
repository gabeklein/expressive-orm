import Entity, { Int, One, Query, VarChar } from '../src';

class Foo extends Entity {
  bar = VarChar();
  baz = VarChar();
}

describe("where.get", () => {
  it("will select via object", () => {
    const query = new Query(where => {
      const { bar, baz } = where(Foo);
  
      return where.get({ bar, baz })
    })
  
    expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`bar\` AS \`bar\`,
  \`Foo\`.\`baz\` AS \`baz\`
FROM
  \`Foo\`
`);
  })
  
  it("will select via map function", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.get(() => {
        return {
          bar: foo.bar,
          baz: foo.baz
        };
      });
    })
  
    expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`bar\` AS \`1\`,
  \`Foo\`.\`baz\` AS \`2\`
FROM
  \`Foo\`
`);
  })
  
  it("will select a field directly", () => {
    const query = new Query(where => {
      const { bar } = where(Foo);
  
      return where.get(bar);
    })
  
    expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`bar\` AS \`1\`
FROM
  \`Foo\`
`);
  })
})

describe("joins", () => {
  class Foo extends Entity {
    name = VarChar();
    color = VarChar();
  }

  it("will select joined values", async () => {
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

  it("will select implicit joined values", async () => {
    class Bar extends Entity {
      name = VarChar();
      foo = One(Foo);
    }
  
    const query = new Query(where => {
      const bar = where(Bar);
  
      return where.get(bar.foo.name)
    });
  
    expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Bar\`
  LEFT JOIN \`Foo\` ON \`Foo\`.\`id\` = \`Bar\`.\`fooId\`
`);
  })
})
