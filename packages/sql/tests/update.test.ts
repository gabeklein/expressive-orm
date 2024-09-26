import { Query, Str, Type } from '../src';

class Foo extends Type {
  value = Str();
  color = Str();
}

it.skip("will generate query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");

    where(foo).update({
      value: "new!",
      color: "blue"
    })
  });

  expect(query).toMatchSnapshot();
})