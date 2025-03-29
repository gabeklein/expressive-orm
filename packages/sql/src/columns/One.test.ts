import { Num, One, Query, Str, Table } from '..';

class A extends Table {
  b = One(B);
  value = Str();
}

class B extends Table {
  c = One(C);
  value = Str();
}

class C extends Table {
  value = Num();
  label = Str();
}

it("will query via direct selection", () => {
  const query = Query(where => {
    return where(A).b.value;
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      b.value
    FROM
      a
      INNER JOIN b ON b.id = a.b_id
  `);
})

it("will select via an object", () => {
  const query = Query(where => {
    const a = where(A);

    return {
      aValue: a.value,
      cValue: a.b.c.value
    }
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      a.value AS "aValue",
      c.value AS "cValue"
    FROM
      a
      INNER JOIN b ON b.id = a.b_id
      INNER JOIN c ON c.id = b.c_id
  `);
})

it("will query nested relationships", () => {
  const query = Query(where => {
    const a = where(A);

    where(a.b.c.value).is(100);
    
    return a.b.c.label;
  })

  expect(query).toMatchInlineSnapshot(`
    SELECT
      c.label
    FROM
      a
      INNER JOIN b ON b.id = a.b_id
      INNER JOIN c ON c.id = b.c_id
    WHERE
      c.value = 100
  `);
})

// it("will join on id if type is passed", async () => {
//   class Foo extends Table {
//     name = Str();
//   }

//   class Bar extends Table {
//     foo = One(Foo);
//     rating = Num();
//   }

//   const query = Query(where => {
//     const foo = where(Foo);
//     const bar = where(Bar, () => {
//       where(bar.foo).is(foo);
//     });

//     where(bar.rating).over(50);

//     return foo.name;
//   });

//   expect(query).toMatchInlineSnapshot(`
//     SELECT
//       foo.name
//     FROM
//       foo
//       INNER JOIN bar ON bar.foo_id = foo.id
//     WHERE
//       bar.rating > 50
//   `);
// });

it("will assert a property-joined value", () => {
  class Foo extends Table {
    name = Str();
    color = Str();
  }

  class Bar extends Table {
    foo = One(Foo);
  }

  const query = Query(where => {
    const bar = where(Bar);

    where(bar.foo.color).is("blue");
  });
  
  expect(query).toMatchInlineSnapshot(`
    SELECT
      COUNT(*)
    FROM
      bar
      INNER JOIN foo ON foo.id = bar.foo_id
    WHERE
      foo.color = 'blue'
  `);
})