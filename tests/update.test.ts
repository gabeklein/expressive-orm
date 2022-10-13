import Entity, { VarChar } from "../src";
import Query from "../src/query/Query";

class Foo extends Entity {
  value = VarChar();
  color = VarChar();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");

    where.update(foo, {
      value: "Updated!",
      color: "blue"
    })
  });

  expect(query).toMatchSnapshot();
})