import Entity, { Query, VarChar } from '../src';

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
