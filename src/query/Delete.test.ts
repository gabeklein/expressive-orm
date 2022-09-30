import Entity, { VarChar } from "..";
import Delete from "./Delete";

function Color(){
  return VarChar({
    oneOf: ["red", "blue", "green"]
  })
}

class Foo extends Entity {
  value = VarChar();
  color = Color();
}

class Bar extends Entity {
  value = VarChar();
  color = Color();
}

it("will generate query", () => {
  const query = new Delete(where => {
    const foo = where.from(Foo);
    where.equal(foo.value, "Hello World!");
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
WHERE
  \`Foo\`.\`value\` = 'Hello World!'
`);
})

it("will support explicit delete", () => {
  const query = new Delete(where => {
    const foo = where.from(Foo);

    where.equal(foo.value, "Hello World!");

    return foo;
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
WHERE
  \`Foo\`.\`value\` = 'Hello World!'
`);
})

it("will include from keyword on join", () => {
  const query = new Delete(where => {
    const foo = where.from(Foo);
    const bar = where.join(Bar);

    where.equal(bar.color, foo.color);
    where.equal(bar.value, "Hello World!");
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
FROM
  \`Foo\`
  INNER JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
WHERE
  \`Bar\`.\`value\` = 'Hello World!'
`);
})

it("will delete from multiple", () => {
  const query = new Delete(where => {
    const foo = where.from(Foo);
    const bar = where.join(Bar);

    where.equal(bar.color, foo.color);
    where.equal(bar.value, "Hello World!");

    return [foo, bar];
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo,
Bar
FROM
  \`Foo\`
  INNER JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
WHERE
  \`Bar\`.\`value\` = 'Hello World!'
`);
})