import Entity, { VarChar } from "..";
import Update from "./Update";

class Foo extends Entity {
  value = VarChar();
  color = VarChar();
}

it("will generate query", () => {
  const query = new Update(Foo, (where, foo) => {
    where(foo.color).is("red");

    return {
      value: "Updated!",
      color: "blue"
    }
  });

  expect(query).toMatchInlineSnapshot(`
UPDATE
  \`Foo\`
SET
  \`value\` = "Updated!",
  \`color\` = "blue"
WHERE
  \`Foo\`.\`color\` = 'red'
`);
})