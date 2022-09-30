import Entity, { Enum, Int, Sub, Select, VarChar } from '..';

function Color(){
  return Enum(["red", "green", "blue"]);
}

class Foo extends Entity {
  color = Color();

  bazValue = Sub(where => {
    const bar = where.join(Bar);
    const baz = where.join(Baz);

    where.equal(bar.color, this.color);
    where.equal(baz.rating, bar.rating);

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
    return where.from(Foo).bazValue;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Baz\`.\`value\` AS \`1\`
FROM
  \`Foo\`
  INNER JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
  INNER JOIN \`Baz\` ON \`Baz\`.\`rating\` = \`Bar\`.\`rating\`
`);
})