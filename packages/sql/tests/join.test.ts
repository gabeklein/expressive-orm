import { Entity, Num, Query, Str, Table } from '../src';

class Foo extends Entity {
  name = Str();
  color = Str();
}

class Bar extends Entity {
  name = Str();
  color = Str();
  rating = Num();
}

class Baz extends Entity {
  color = Str();
  rating = Num();
}

it("will join using object", async () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, { rating: bar.rating });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);
    where(baz.color).is("blue");
  });

  expect(query).toMatchSnapshot();
})

it("will join using function", async () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, on => {
      on(bar.name).not(foo.name);
      on(bar.color).is(foo.color);
    });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);
  });

  expect(query).toMatchSnapshot();
})

it("will alias tables which have a schema", () => {
  class Foo extends Entity {
    this = Table({ schema: "foobar" });

    name = Str();
    color = Str();
  }

  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  })

  expect(query).toMatchSnapshot();
})