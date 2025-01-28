import { Type, Num, Query, Str, Bool } from '..';

class Item extends Type  {
  number = Num();
}

it("will limit results", async () => {
  const results = Query(where => {
    const item = where(Item);

    where(item.number).over(3);
    where(3);

    return item.number;
  });

  expect(results).toMatchInlineSnapshot(`
    SELECT
      item.number
    FROM
      item
    WHERE
      item.number > 3
    LIMIT
      3
  `);
});

it("will add operator clauses", () => {
  const results = Query(where => {
    const item = where(Item);

    where(item.number).is(5);
    where(item.number).not(0);
    where(item.number).over(4);
    where(item.number).over(5, true);
    where(item.number).under(6);
    where(item.number).under(5, true);
  });

  expect(results).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      item
    WHERE
      item.number = 5
      AND item.number <> 0
      AND item.number > 4
      AND item.number >= 5
      AND item.number < 6
      AND item.number <= 5
  `);
});

it("will add IN clause", () => {
  const results = Query(where => {
    const item = where(Item);

    where(item.number).in([1, 2, 3]);
  });

  expect(results).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      item
    WHERE
      item.number IN (1, 2, 3)
  `);
});

describe("grouping", () => {
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
      where(test.b).not(2);
      where(test.c).over(3);
      where(test.d).under(4);
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        test
      WHERE
        test.a = 1
        AND test.b <> 2
        AND test.c > 3
        AND test.d < 4
    `);
  })

  it("will group clauses", () => {
    class Foo extends Type {
      name = Str();
      color = Str();
    }

    const query = Query(where => {
      const foo = where(Foo);

      where(
        where(foo.name).is("Gabe"),
        where(foo.color).is("purple"),
        where(
          where(foo.color).not("orange"),
          where(foo.color).not("yellow"),
        )
      )
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        foo
      WHERE
        foo.name = 'Gabe'
        OR foo.color = 'purple'
        OR (
          foo.color <> 'orange'
          AND foo.color <> 'yellow'
        )
    `);
  })

  it("will group recursively", () => {
    class Foo extends Type {
      name = Str();
      color = Str();
    }

    const query = Query(where => {
      const foo = where(Foo);

      where(foo.id).over(1);

      where(
        where(
          where(foo.name).is("Gabe"),
          where(foo.color).is("red"),
        ),
        where(
          where(foo.name).is("Bob"),
          where(
            where(foo.color).is("blue"),
            where(foo.color).is("green")
          )
        )
      )
    });
    
    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        foo
      WHERE
        foo.id > 1
        AND (
          foo.name = 'Gabe'
          AND foo.color = 'red'
          OR (
            foo.name = 'Bob'
            AND (
              foo.color = 'blue'
              OR foo.color = 'green'
            )
          )
        )
    `);
  })
});

describe("complex grouping", () => {
  class Item extends Type {
    name = Str();
    price = Num();
    color = Str();
    size = Str();
    inStock = Bool();
  }

  it("will alternate between OR and AND groups", () => {
    const query = Query(where => {
      const item = where(Item);
      
      where(
        where(
          where(item.color).is("red"),
          where(
            where(item.size).is("small"),
            where(item.size).is("medium")
          )
        ),
        where(
          where(item.color).is("blue"),
          where(item.size).is("large")
        )
      );
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        item
      WHERE
        item.color = 'red'
        AND (
          item.size = 'small'
          OR item.size = 'medium'
        )
        OR (
          item.color = 'blue'
          AND item.size = 'large'
        )
    `);
  });

  it("will combine standalone and grouped conditions", () => {
    const query = Query(where => {
      const item = where(Item);
      
      // Standalone condition at query level = AND
      where(item.id).over(0);
      
      // Group of conditions = OR between siblings
      where(
        where(item.price).over(50),
        where(
          where(item.color).is("red"),
          where(item.size).is("large")
        ),
        where(item.inStock).is(true)
      );
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        item
      WHERE
        item.id > 0
        AND (
          item.price > 50
          OR (
            item.color = 'red'
            AND item.size = 'large'
          )
          OR item.in_stock = 1
        )
    `);
  });

  it("will collapse unnecessary nesting", () => {
    const query = Query(where => {
      const item = where(Item);
      
      where(
        where(
          where(item.price).over(100)
        ),
        where(item.color).is("red"),
        where(
          where(item.size).is("large"),
          where(item.inStock).is(true)
        )
      );
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        item
      WHERE
        item.price > 100
        OR item.color = 'red'
        OR (
          item.size = 'large'
          AND item.in_stock = 1
        )
    `);
  });
});

describe("sort", () => {
  class Test extends Type {
    name = Str();
    rating = Num();
  }

  it("will add order clause", async () => {
    const query = Query(where => {
      const test = where(Test);
  
      where(test.id).desc()
  
      return test.name;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        test.name
      FROM
        test
      ORDER BY
        test.id desc
    `);
  })

  it("will sort multiple columns", async () => {
    const query = Query(where => {
      const test = where(Test);
  
      where(test.rating).asc()
      where(test.name).desc()
  
      return test.name;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        test.name
      FROM
        test
      ORDER BY
        test.rating asc,
        test.name desc
    `);

    // SQLite may not support multiple column sorting
  })  
})