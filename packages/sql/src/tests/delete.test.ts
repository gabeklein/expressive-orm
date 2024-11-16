import { Query, Str, Type } from '../';

class Foo extends Type {
  value = Str();
  color = Str();
}

class Bar extends Type {
  value = Str();
  color = Str();
}

it("will generate query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.value).is("Hello World!");
    where(foo).delete();
  });

  expect(query).toMatchInlineSnapshot(`
    delete from
      \`foo\`
    where
      \`foo\`.\`value\` = 'Hello World!'
  `);
})

it("will include FROM statement where JOIN exists", () => {
  const query = Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is("Hello World!");
    where(foo).delete();
  });

  expect(query).toMatchInlineSnapshot(`
    delete \`foo\`
    from
      \`foo\`
      inner join \`bar\` on \`bar\`.\`color\` = \`foo\`.\`color\`
    where
      \`bar\`.\`value\` = 'Hello World!'
  `);
})