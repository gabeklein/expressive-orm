import { Num, One, Query, Str, Type } from '..';

class A extends Type {
  b = One(B);
  value = Str();
}

class B extends Type {
  c = One(C);
  value = Str();
}

class C extends Type {
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
      a.value AS aValue,
      c.value AS cValue
    FROM
      a
      INNER JOIN b ON b.id = a.b_id
      INNER JOIN c ON c.id = b.c_id
  `);
})

it("will query nested relationships", () => {
  const query = Query(where => {
    const a = where(A);

    where(a.b.c.value).equal(100);
    
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

it("will join on id if type is passed", async () => {
  class Foo extends Type {
    name = Str();
  }

  class Bar extends Type {
    foo = One(Foo);
    rating = Num();
  }

  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { foo });

    where(bar.rating).over(50);

    return foo.name;
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      foo.name
    FROM
      foo
      INNER JOIN bar ON bar.foo_id = foo.id
    WHERE
      bar.rating > 50
  `);
});

it.skip("will assert a property-joined value", () => {
  class Foo extends Type {
    name = Str();
    color = Str();
  }

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