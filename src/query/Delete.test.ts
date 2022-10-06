import Entity, { VarChar } from "..";
import Delete from "./Delete";

class Foo extends Entity {
  value = VarChar();
  color = VarChar();
}

class Bar extends Entity {
  value = VarChar();
  color = VarChar();
}

it("will generate query", () => {
  const query = new Delete(where => {
    const foo = where(Foo);
    where(foo.value).is("Hello World!");
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
WHERE
  \`Foo\`.\`value\` = 'Hello World!'
`);
})

it("will support explicit delete", () => {
  const query = new Delete(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");

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
    const foo = where(Foo);
    const bar = where(Bar);

    where(bar.color).is(foo.color);
    where(bar.value).is("Hello World!");
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
    const foo = where(Foo);
    const bar = where(Bar);

    where(bar.color).is(foo.color);
    where(bar.value).is("Hello World!");

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