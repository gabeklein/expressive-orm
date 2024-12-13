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