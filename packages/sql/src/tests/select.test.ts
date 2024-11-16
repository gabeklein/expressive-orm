import { Query, Str, Type } from '../';

class Foo extends Type {
  bar = Str();
  baz = Str();
}

describe("select", () => {
  it("will select via object", () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);
  
      return { bar, baz }
    })
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`foo\`.\`bar\` as \`bar\`,
        \`foo\`.\`baz\` as \`baz\`
      from
        \`foo\`
    `);
  })
  
  it("will select a field directly", () => {
    const query = Query(where => {
      const foo = where(Foo);
  
      return foo.bar;
    })
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`foo\`.\`bar\` as \`bar\`
      from
        \`foo\`
    `);
  })
  
  it("will select a entire entity", () => {
    const query = Query(where => {
      return where(Foo);
    })
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`foo\`.\`id\` as \`id\`,
        \`foo\`.\`bar\` as \`bar\`,
        \`foo\`.\`baz\` as \`baz\`
      from
        \`foo\`
    `);
  })
})