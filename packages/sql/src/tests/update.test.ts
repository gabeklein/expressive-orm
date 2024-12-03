import { Query, Str, Type } from '../';

class Foo extends Type {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
    where(foo).update({
      value: "new!",
      color: "blue"
    })
  });

  expect(query).toMatchInlineSnapshot(`
    update
      \`foo\`
    set
      \`value\` = 'new!',
      \`color\` = 'blue'
    where
      \`foo\`.\`color\` = 'red'
  `);
})