import { Entity, Join, Number, Query, String } from '../../src';

class Foo extends Entity {
  color = String();

  bazValue = Join(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return baz.value;
  })
}

class Bar extends Entity {
  value = String();
  color = String();
  rating = Number();
}

class Baz extends Entity {
  value = String();
  rating = Number();
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