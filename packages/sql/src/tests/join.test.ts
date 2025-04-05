import { Num, Primary, Query, Str, Table } from '..';

class Foo extends Table {
  name = Str();
  color = Str();
}

class Bar extends Table {
  name = Str();
  color = Str();
  rating = Num();
}

class Baz extends Table {
  color = Str();
  rating = Num();
}

it("will join using function", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);

    where(bar.name).not(foo.name);
    where(bar.color).equal(foo.color);

    where(foo.name).not("Danny");
    where(bar.rating).over(50);
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

it("will join multiple", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);
    const baz = where(Baz);

    where(bar.color).equal(foo.color);
    where(baz.rating).equal(bar.rating);

    where(foo.name).not("Danny");
    where(bar.rating).over(50);
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

it("will throw if joins are composed", async () => {
  const query = () => Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);

    where(
      where(bar.color).equal(foo.color)
    );
  });

  expect(query).toThrowErrorMatchingInlineSnapshot(
    `Cannot use bar.color = foo.color in a group.`
  );
});

it.skip("will filter for comparisons to later tables", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);

    where(bar.color).equal(foo.color);
    where(foo.name).equal(bar.name);
  });

  type Returns = Query<number>;

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      foo
      INNER JOIN bar ON bar.color = foo.color
    WHERE
      foo.name = bar.name
  `);
})

it("will join a table with alias", async () => {
  class Baz extends Table {
    is = Primary({ tableSchema: "other" });

    color = Str();
    rating = Num();
  }
  
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Baz);

    where(bar.color).equal(foo.color);

    return bar.rating;
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      T1.rating
    FROM
      foo
      INNER JOIN other.baz T1 ON T1.color = foo.color
  `);
});

it.todo("will self join");

it("will select left join", async () => {
  class Bar extends Table {
    name = Str();
    color = Str();
    rating = Num();
  }
  
  class Baz extends Table {
    rating = Num();
    name = Str();
  }

  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar);
    const baz = where(Baz, true);

    where(bar.color).equal(foo.color);
    where(baz.rating).equal(bar.rating);

    where(foo.name).not("Danny");
    where(bar.rating).over(50);

    return {
      fooValue: foo.name,
      barValue: bar.name,
      bazRating: baz.rating
    }
  });

  type Returns = Query.Selects<{
    fooValue: string;
    barValue: string;
    bazRating: number | undefined;
  }>

  expect<Returns>(query).toMatchInlineSnapshot(`
    SELECT
      foo.name AS "fooValue",
      bar.name AS "barValue",
      baz.rating AS "bazRating"
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
    const bar = where(Bar);

    where(bar.color).equal(foo.color);
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
  class Test extends Table {
    name = Str();
    rating = Num();
  }

  class Other extends Table {
    name = Str();
    rank = Num();
  }

  const query = Query(where => {
    const test = where(Test);
    const other = where(Other);

    where(other.name).equal(test.name);
    where(other.rank).asc();

    return other.name;
  });

  type Returns = Query.Selects<string>;

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