import { Num, Query, Str, Table, Time, Type } from '../';

class Foo extends Type {
  name = Str();
  date = Time();
  color = Str();
}

it("will count query by default", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  });

  const qb = query.toString();

  expect(qb).toMatchInlineSnapshot(`
    select
      count(*)
    from
      \`foo\`
    where
      \`foo\`.\`color\` = 'red'
  `);
})

describe("where", () => {
  it("will chain clauses", () => {
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

  it("will group clauses", () => {
    const query = Query(where => {
      const foo = where(Foo);

      // @ts-ignore
      where([
        where(foo.name).is("Gabe"),
        where(foo.color).is("purple"),
      ])
    });

    expect(query.toString()).toMatchInlineSnapshot(`
      select
        count(*)
      from
        \`foo\`
      where
        (
          \`foo\`.\`name\` = 'Gabe'
          or \`foo\`.\`color\` = 'purple'
        )
    `);
  })

  it("will group recursively", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.id).isMore(1);

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
    
    expect(query).toMatchInlineSnapshot(`
      select
        count(*)
      from
        \`foo\`
      where
        \`foo\`.\`id\` > 1
        and (
          \`foo\`.\`name\` = 'Gabe'
          and \`foo\`.\`color\` = 'red'
        )
        or (
          \`foo\`.\`name\` = 'Bob'
          and (
            \`foo\`.\`color\` = 'blue'
            or \`foo\`.\`color\` = 'green'
          )
        )
    `);
  })
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
  
      return test.name;
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
})

describe("schema", () => {
  it("will alias tables with a schema", () => {
    class Foo extends Type {
      this = Table({ schema: "foobar" });
  
      name = Str();
      color = Str();
    }
  
    const query = Query(where => {
      const foo = where(Foo);
  
      where(foo.color).is("red");
    })
  
    expect(query).toMatchInlineSnapshot(`
      select
        count(*)
      from
        \`foobar\`.\`foo\` as \`$0\`
      where
        \`$0\`.\`color\` = 'red'
    `);
  })
})

it.todo("will reject query via select function")