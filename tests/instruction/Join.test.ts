import Entity, { Column, Query, Join } from '../../src';

class Foo extends Entity {
  color = Column();

  bazValue = Join(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return baz.value;
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

it("will integrate query on select", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    return where.top({
      baz: foo.bazValue,
      color: foo.color
    });
  });

  expect(query).toMatchSnapshot();
})