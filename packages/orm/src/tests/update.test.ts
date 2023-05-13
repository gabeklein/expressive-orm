import { Entity, String } from '../';
import Query from '../query/Query';

class Foo extends Entity {
  value = String();
  color = String();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");

    where.updates(foo, {
      value: "new!",
      color: "blue"
    })
  });

  expect(query).toMatchSnapshot();
})