import { Num, Query, Str, Type } from '../';

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

describe("joins", () => {
  class Foo extends Type {
    name = Str();
    color = Str();
  }

  it("will select joined values", async () => {
    class Bar extends Type {
      name = Str();
      color = Str();
      rating = Num();
    }
    
    class Baz extends Type {
      rating = Num();
      name = Str();
    }
  
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar, { color: foo.color });
      const baz = where(Baz, { rating: bar.rating }, "left");
  
      where(foo.name).isNot("Danny");
      where(bar.rating).isMore(50);
  
      return {
        fooValue: foo.name,
        barValue: bar.name,
        bazRating: baz.rating
      }
    });
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`foo\`.\`name\` as \`fooValue\`,
        \`bar\`.\`name\` as \`barValue\`,
        \`baz\`.\`rating\` as \`bazRating\`
      from
        \`foo\`
        inner join \`bar\` on \`bar\`.\`color\` = \`foo\`.\`color\`
        left join \`baz\` on \`baz\`.\`rating\` = \`bar\`.\`rating\`
      where
        \`foo\`.\`name\` <> 'Danny'
        and \`bar\`.\`rating\` > 50
    `);
  })

  it.todo("will join values using function")
})

describe("sort", () => {
  class Test extends Type {
    id = Num();
    name = Str();
    rating = Num();
  }

  it("will add order clause", async () => {
    const query = Query(where => {
      const test = where(Test);
  
      where(test.id).isAsc()
  
      return {
        name: test.name
      }
    });
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`test\`.\`name\` as \`name\`
      from
        \`test\`
      order by
        \`test\`.\`id\` asc
    `);
  })

  it("will add multiple clauses", async () => {
    const query = Query(where => {
      const test = where(Test);
  
      where(test.rating).isAsc()
      where(test.name).isAsc()
  
      return {
        name: test.name
      }
    });
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`test\`.\`name\` as \`name\`
      from
        \`test\`
      order by
        \`test\`.\`rating\` asc,
        \`test\`.\`name\` asc
    `);
  })

  it("will sort by joined table", async () => {
    class Other extends Type {
      name = Str();
      rank = Num();
    }

    const query = Query(where => {
      const test = where(Test);
      const other = where(Other, {
        name: test.name
      })
  
      where(other.rank).isAsc()
  
      return {
        name: test.name
      }
    });
  
    expect(query).toMatchInlineSnapshot(`
      select
        \`test\`.\`name\` as \`name\`
      from
        \`test\`
        inner join \`other\` on \`other\`.\`name\` = \`test\`.\`name\`
      order by
        \`other\`.\`rank\` asc
    `);
  })
})