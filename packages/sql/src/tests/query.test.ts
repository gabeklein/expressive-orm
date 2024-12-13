import { inMemoryDatabase } from '.';
import { Num, Query, Str, Table, Time, Type } from '../';

class Foo extends Type {
  name = Str();
  date = Time();
  color = Str();
}

it("will count query by default", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).equal("red");
  });

  const qb = query.toString();

  expect(qb).toMatchInlineSnapshot(`
    SELECT
      count(*)
    FROM
      foo
    WHERE
      foo.color = 'red'
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
  
      where(test.a).equal(1);
      where(test.b).not(2);
      where(test.c).more(3);
      where(test.d).less(4);
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        count(*)
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
    const query = Query(where => {
      const foo = where(Foo);

      // @ts-ignore
      where([
        where(foo.name).equal("Gabe"),
        where(foo.color).equal("purple"),
      ])
    });

    expect(query.toString()).toMatchInlineSnapshot(`
      SELECT
        count(*)
      FROM
        foo
      WHERE
        (
          foo.name = 'Gabe'
          or foo.color = 'purple'
        )
    `);
  })

  it("will group recursively", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.id).more(1);

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
        count(*)
      FROM
        foo
      WHERE
        foo.id > 1
        AND (
          foo.name = 'Gabe'
          AND foo.color = 'red'
        )
        or (
          foo.name = 'Bob'
          AND (
            foo.color = 'blue'
            or foo.color = 'green'
          )
        )
    `);
  })
})


describe("sort", () => {
  class Test extends Type {
    name = Str();
    rating = Num();
  }

  inMemoryDatabase({ Test }, async () => {
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
  
      where.order(test.id).desc()
  
      return test.name;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        test.name
      FROM
        test
      ORDER BY
        test.id DESC
    `);

    expect(await query).toEqual(["F", "E", "D", "C", "B", "A"]);
  })

  it("will sort multiple columns", async () => {
    const query = Query(where => {
      const test = where(Test);
  
      where.order(test.rating).asc()
      where.order(test.name).desc()
  
      return test.name;
    });
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        test.name
      FROM
        test
      ORDER BY
        test.rating ASC,
        test.name DESC
    `);

    // SQLite may not support multiple column sorting
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
  
      where(foo.color).equal("red");
    })
  
    expect(query).toMatchInlineSnapshot(`
      SELECT
        count(*)
      FROM
        foobar.foo AS \`$0\`
      WHERE
        \`$0\`.color = 'red'
    `);
  })
})

it.todo("will reject query via select function")