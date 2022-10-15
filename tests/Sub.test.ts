import Entity, { Column, Query, Sub } from '../src';

class Foo extends Entity {
  color = Column();

  bazValue = Sub(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return where.one(baz.value);
  })
}

class Bar extends Entity {
  value = Column();
  color = Column();
  rating = Column();
}

class Baz extends Entity {
  value = Column();
  rating = Column();
}

it.skip("will integrate query on select", () => {
  const query = new Query(where => {
    const { bazValue } = where(Foo);

    return where.top(bazValue);
  });

  expect(query).toMatchSnapshot();
})