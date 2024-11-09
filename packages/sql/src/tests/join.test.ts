import { Num, Query, Str, Table, Type } from '../';

class Foo extends Type {
  name = Str();
  color = Str();
}

class Bar extends Type {
  name = Str();
  color = Str();
  rating = Num();
}

class Baz extends Type {
  color = Str();
  rating = Num();
}

it("will join using object", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, { rating: bar.rating });

    where(foo.name).isNot("Danny");
    where(bar.rating).isMore(50);
    where(baz.color).is("blue");
  });

  expect(query).toMatchSnapshot();
})

it("will join using function", async () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, on => {
      on(bar.name).isNot(foo.name);
      on(bar.color).is(foo.color);
    });

    where(foo.name).isNot("Danny");
    where(bar.rating).isMore(50);
  });

  expect(query).toMatchSnapshot();
})

it("will alias tables which have a schema", () => {
  class Foo extends Type {
    this = Table({ schema: "foobar" });

    name = Str();
    color = Str();
  }

  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  })

  expect(query).toMatchSnapshot();
})