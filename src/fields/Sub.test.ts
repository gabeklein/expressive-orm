import Entity, { Enum, Int, Sub, VarChar, Query } from '..';

function Color(){
  return Enum(["red", "green", "blue"]);
}

class Foo extends Entity {
  color = Color();

  bazValue = Sub(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return where.getOne(baz.value);
  })
}

class Bar extends Entity {
  value = VarChar();
  color = Color();
  rating = Int();
}

class Baz extends Entity {
  value = VarChar();
  rating = Int();
}

it.skip("will integrate query on select", () => {
  const query = new Query(where => {
    const { bazValue } = where(Foo);

    return where.get(bazValue);
  });

  expect(query).toMatchSnapshot();
})