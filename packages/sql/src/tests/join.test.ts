import { Num, One, Query, Str, Type } from '../';

class Foo extends Type {
  name = Str();
  color = Str();
}

class Bar extends Type {
  name = Str();
  color = Str();
  rating = Num();
}

class Baz extends Type {
  color = Str();
  rating = Num();
}

it("will join using object", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, { rating: bar.rating });

    where(foo.name).isNot("Danny");
    where(bar.rating).isMore(50);
    where(baz.color).is("blue");
  });

  expect(query).toMatchInlineSnapshot(`
    select
      count(*)
    from
      \`foo\`
      inner join \`bar\` on \`bar\`.\`color\` = \`foo\`.\`color\`
      inner join \`baz\` on \`baz\`.\`rating\` = \`bar\`.\`rating\`
    where
      \`foo\`.\`name\` <> 'Danny'
      and \`bar\`.\`rating\` > 50
      and \`baz\`.\`color\` = 'blue'
  `);
})

it("will join using function", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, on => {
      on(bar.name).isNot(foo.name);
      on(bar.color).is(foo.color);
    });

    where(foo.name).isNot("Danny");
    where(bar.rating).isMore(50);
  });

  expect(query).toMatchInlineSnapshot(`
    select
      count(*)
    from
      \`foo\`
      inner join \`bar\` on \`bar\`.\`name\` <> \`foo\`.\`name\`
      and \`bar\`.\`color\` = \`foo\`.\`color\`
    where
      \`foo\`.\`name\` <> 'Danny'
      and \`bar\`.\`rating\` > 50
  `);
})

it("will select left join", async () => {
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
  
it("will assert a joined property's value", () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.rating).is(42);
  });
  
  expect(query).toMatchInlineSnapshot(`
    select
      count(*)
    from
      \`foo\`
      inner join \`bar\` on \`bar\`.\`color\` = \`foo\`.\`color\`
    where
      \`bar\`.\`rating\` = 42
  `);
})

it("will sort by joined table", async () => {
  class Test extends Type {
    id = Num();
    name = Str();
    rating = Num();
  }

  class Other extends Type {
    name = Str();
    rank = Num();
  }

  const query = Query(where => {
    const test = where(Test);
    const other = where(Other, { name: test.name })

    where(other.rank).isAsc()

    return other.name;
  });

  expect(query).toMatchInlineSnapshot(`
    select
      \`other\`.\`name\` as \`name\`
    from
      \`test\`
      inner join \`other\` on \`other\`.\`name\` = \`test\`.\`name\`
    order by
      \`other\`.\`rank\` asc
  `);
})

it.skip("will assert a property-joined value", () => {
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