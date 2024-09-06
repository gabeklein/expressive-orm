import { Type, Str, Num, One, Query } from '../../src';

class A extends Type {
  b = One(B);
  value = Str();
}

class B extends Type {
  c = One(C);
}

class C extends Type {
  value = Num();
  label = Str();
}

it("will query via select function", () => {
  const query = new Query(where => {
    const a = where(A);

    return where.get(() => a.value);
  });

  expect(query).toMatchSnapshot();
})

it("will select via an object", () => {
  const query = new Query(where => {
    const a = where(A);

    return where.get({
      aValue: a.value,
      cValue: a.b.c.value
    })
  });

  expect(query).toMatchSnapshot();
})

it("will query nested relationships", () => {
  // TODO: fix types
  const query = new Query(where => {
    const a = where(A);

    where(a.b.c.value).is(100);
    
    return where.get(a.b.c.label);
  })

  expect(query).toMatchSnapshot();
})