import { Num, One, Query, Str, Type } from '../';
import { SelectQuery } from '../Query';

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

    where(foo.name).not("Danny");
    where(bar.rating).more(50);
    where(baz.color).equal("blue");
  });

  type Returns = Query<number>;

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foo
      INNER JOIN bar ON bar.color = foo.color
      INNER JOIN baz ON baz.rating = bar.rating
    WHERE
      foo.name <> 'Danny'
      AND bar.rating > 50
      AND baz.color = 'blue'
  `);
})

it("will join using function", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, on => {
      on(bar.name).not(foo.name);
      on(bar.color).equal(foo.color);
    });

    where(foo.name).not("Danny");
    where(bar.rating).more(50);
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foo
      INNER JOIN bar ON bar.name <> foo.name
      AND bar.color = foo.color
    WHERE
      foo.name <> 'Danny'
      AND bar.rating > 50
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

    where(foo.name).not("Danny");
    where(bar.rating).more(50);

    return {
      fooValue: foo.name,
      barValue: bar.name,
      bazRating: baz.rating
    }
  });

  type Returns = SelectQuery<{
    fooValue: string;
    barValue: string;
    bazRating: number | undefined;
}>

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.name AS fooValue,
      bar.name AS barValue,
      baz.rating AS bazRating
    FROM
      foo
      INNER JOIN bar ON bar.color = foo.color
      LEFT JOIN baz ON baz.rating = bar.rating
    WHERE
      foo.name <> 'Danny'
      AND bar.rating > 50
  `);
})
  
it("will assert a joined property's value", () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.rating).equal(42);
  });
  
  expect(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foo
      INNER JOIN bar ON bar.color = foo.color
    WHERE
      bar.rating = 42
  `);
})

it("will sort by joined table", async () => {
  class Test extends Type {
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

    where(other.rank).asc();

    return other.name;
  });

  type Returns = SelectQuery<string>;

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      other.name
    FROM
      test
      INNER JOIN other ON other.name = test.name
    ORDER BY
      other.rank asc
  `);
})

it.skip("will assert a property-joined value", () => {
  class Bar extends Type {
    foo = One(Foo);
    greeting = "Hello World";
  }

  const query = Query(where => {
    const bar = where(Bar);

    where(bar.foo.color).equal("blue");
  });
  
  expect(query).toMatchInlineSnapshot();
})