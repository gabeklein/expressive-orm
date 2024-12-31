import { Type, Num, Query, Str } from '..';
import { TestConnection } from '../connection/TestConnection';

class Item extends Type  {
  number = Num();
}

new TestConnection([Item], async () => {
  await Item.insert(10, i => ({ number: i }));
});

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

  expect(await results).toEqual([4, 5, 6]);
});

it("will add operator clauses", () => {
  const results = Query(where => {
    const item = where(Item);

    where(item.number).equal(5);
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
  
      where(test.a).equal(1);
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

      where([
        where(foo.name).equal("Gabe"),
        where(foo.color).equal("purple"),
      ])
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        foo
      WHERE
        (
          foo.name = 'Gabe'
          OR foo.color = 'purple'
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

      where([ 
        where(foo.name).equal("Gabe"),
        where(foo.color).equal("red"),
      ], [
        where(foo.name).equal("Bob"),
        where([
          where(foo.color).equal("blue"),
          where(foo.color).equal("green"),
        ])
      ])
    });
    
    expect(query).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        foo
      WHERE
        foo.id > 1
        AND (
          (
            foo.name = 'Gabe'
            AND foo.color = 'red'
          )
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

describe("sort", () => {
  class Test extends Type {
    name = Str();
    rating = Num();
  }

  new TestConnection({ Test }, async () => {
    await Test.insert([
      { name: "A", rating: 1 },
      { name: "B", rating: 2 },
      { name: "C", rating: 3 },
      { name: "D", rating: 1 },
      { name: "E", rating: 2 },
      { name: "F", rating: 3 },
    ])
  });

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

    expect(await query).toEqual(["F", "E", "D", "C", "B", "A"]);
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