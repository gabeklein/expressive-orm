import { Type, Num, One, Query, Str } from '../src';

class Foo extends Type {
  name = Str();
  color = Str();
}

class Bar extends Type {
  value = Num();
  color = Str();
}

it("will emit where clauses", () => {
  class Test extends Type {
    a = Num();
    b = Num();
    c = Num();
    d = Num();
  }

  const query = new Query(where => {
    const test = where(Test);

    where(test.a).is(1);
    where(test.b).not(2);
    where(test.c).greater(3);
    where(test.d).less(4);
  });

  expect(query).toMatchSnapshot();
})

it("will assert a joined property's value", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is(42);
  });
  
  expect(query).toMatchSnapshot();
})

it.skip("will assert an implictly joined value", () => {
  class Bar extends Type {
    foo = One(Foo);
    greeting = "Hello World";
  }

  const query = new Query(where => {
    const bar = where(Bar);

    where(bar.foo.color).is("blue");
  });
  
  expect(query).toMatchInlineSnapshot();
})

it("will match values via object", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo).has({
      name: "Gabe",
      color: "blue"
    })
  });

  expect(query).toMatchSnapshot();
})