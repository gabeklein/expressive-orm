import { Num, One, Query, Str, Type } from '../';

class Foo extends Type {
  name = Str();
  color = Str();
}

class Bar extends Type {
  value = Num();
  color = Str();
}

describe("basic", () => {
  it("will emit where clauses", () => {
    class Test extends Type {
      a = Num();
      b = Num();
      c = Num();
      d = Num();
    }
  
    const query = Query(where => {
      const test = where(Test);
  
      where(test.a).is(1);
      where(test.b).isNot(2);
      where(test.c).isMore(3);
      where(test.d).isLess(4);
    });
  
    expect(query).toMatchInlineSnapshot(`
      select
        count(*)
      from
        \`test\`
      where
        \`test\`.\`a\` = 1
        and \`test\`.\`b\` <> 2
        and \`test\`.\`c\` > 3
        and \`test\`.\`d\` < 4
    `);
  })
  
  it("will assert a joined property's value", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar, { color: foo.color });
  
      where(bar.value).is(42);
    });
    
    expect(query).toMatchInlineSnapshot(`
      select
        count(*)
      from
        \`foo\`
        inner join \`bar\` on \`bar\`.\`color\` = \`foo\`.\`color\`
      where
        \`bar\`.\`value\` = 42
    `);
  })
  
  it.skip("will assert an implictly joined value", () => {
    class Bar extends Type {
      foo = One(Foo);
      greeting = "Hello World";
    }
  
    const query = Query(where => {
      const bar = where(Bar);
  
      where(bar.foo.color).is("blue");
    });
    
    expect(query).toMatchInlineSnapshot();
  })
  
  // replace with where(foo).is({ ... })
  // it.skip("will match values via object", () => {
  //   const query = Query(where => {
  //     const foo = where(Foo);
  
  //     where(foo).has({
  //       name: "Gabe",
  //       color: "blue"
  //     })
  //   });
  
  //   expect(query).toMatchSnapshot();
  // })
})

describe.skip("nested", () => {
  it("will match nested values", () => {
    const query = Query(where => {
      const foo = where(Foo);

      // @ts-ignore
      where([
        where(foo.name).is("Gabe"),
        where(foo.color).is("purple"),
      ])
    });

    expect(query.toString()).toMatchInlineSnapshot(`
      SELECT count(*)
      WHERE (
        foo.name = 'Gabe' OR foo.color = 'purple'
      )
    `);
  })

  it("will match recursively", () => {
    const query = Query(where => {
      const foo = where(Foo);

      // @ts-ignore
      where([ 
        where(foo.name).is("Gabe"),
        where(foo.color).is("red"),
      ], [
        where(foo.name).is("Bob"),
        where([
          where(foo.color).is("blue"),
          where(foo.color).is("green"),
        ])
      ])
    });

    expect(query.toString()).toMatchInlineSnapshot(`
      SELECT count(*)
      WHERE (
        foo.name = 'Gabe' AND foo.color = 'red'
      ) OR (
        foo.name = 'Bob' AND (
          foo.color = 'blue' OR foo.color = 'green'
        )
      )
    `);
  })
})