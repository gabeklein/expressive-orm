import { Num, One, Query, Str, Type } from '../..';

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

it.only("skip tests", () => {})

it("will query via direct selection", () => {
  const query = new Query(where => {
    const a = where(A);

    return a.value
  });

  expect(query).toMatchSnapshot();
})

it("will query via select function", () => {
  const query = new Query(where => {
    const a = where(A);

    return () => a.value
  });

  expect(query).toMatchSnapshot();
})

it("will select via an object", () => {
  const query = new Query(where => {
    const a = where(A);

    return {
      aValue: a.value,
      cValue: a.b.c.value
    }
  });

  expect(query).toMatchSnapshot();
})

it("will query nested relationships", () => {
  // TODO: fix types
  const query = new Query(where => {
    const a = where(A);

    where(a.b.c.value).is(100);
    
    return a.b.c.label
  })

  expect(query).toMatchSnapshot();
})