import { Query, Str, Type } from '../src';

class Foo extends Type {
  name = Str();
  color = Str();
}

it("will create count query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  });

  const qb = query.count().toString();

  expect(qb).toMatchSnapshot();
})