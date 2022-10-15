import Entity, { Column } from "../src";
import Query from "../src/query/Query";

class Foo extends Entity {
  value = Column();
  color = Column();
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