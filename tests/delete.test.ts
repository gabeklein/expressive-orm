import Entity, { Query, VarChar } from '../src';

class Foo extends Entity {
  value = VarChar();
  color = VarChar();
}

class Bar extends Entity {
  value = VarChar();
  color = VarChar();
}

it("will generate query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");

    where.delete(foo);
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
WHERE
  \`Foo\`.\`value\` = 'Hello World!'
`);
})

it("will include FROM statement where JOIN exists", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.delete(foo);
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
WHERE
  \`Bar\`.\`value\` = 'Hello World!'
`);
})

it("will delete from multiple", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");

    where.delete(foo, bar);
  });

  expect(query).toMatchInlineSnapshot(`
DELETE Foo,
Bar
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
WHERE
  \`Bar\`.\`value\` = 'Hello World!'
`);
})