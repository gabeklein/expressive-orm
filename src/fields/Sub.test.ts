import Entity, { Enum, Int, Sub, Select, VarChar } from '..';

function Color(){
  return Enum(["red", "green", "blue"]);
}

class Foo extends Entity {
  color = Color();

  bazValue = Sub(where => {
    const bar = where(Bar, { color: this.color });
    const baz = where(Baz, { rating: bar.rating });

    return baz.value;
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

it("will integrate query on select", () => {
  const query = new Select(where => {
    return where(Foo).bazValue;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Baz\`.\`value\` AS \`1\`
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
  JOIN \`Baz\` ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
`);
})