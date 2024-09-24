import { Join, Num, Query, Str, Type } from '../..';

class Foo extends Type {
  color = Str();

  bazValue = Join(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return baz.value;
  })
}

class Bar extends Type {
  value = Str();
  color = Str();
  rating = Num();
}

class Baz extends Type {
  value = Str();
  rating = Num();
}

it.skip("will integrate query on select", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    return {
      baz: foo.bazValue,
      color: foo.color
    }
  });

  expect(query).toMatchSnapshot();
})