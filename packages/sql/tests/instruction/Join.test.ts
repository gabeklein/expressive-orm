import { Entity, Join, Num, Query, Str } from '../../src';

class Foo extends Entity {
  color = Str();

  bazValue = Join(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return baz.value;
  })
}

class Bar extends Entity {
  value = Str();
  color = Str();
  rating = Num();
}

class Baz extends Entity {
  value = Str();
  rating = Num();
}

it("will integrate query on select", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    return where.get({
      baz: foo.bazValue,
      color: foo.color
    });
  });

  expect(query).toMatchSnapshot();
})