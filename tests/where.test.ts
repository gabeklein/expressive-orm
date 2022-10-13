import { Entity, Int, One, Query, VarChar } from '../src';

class Foo extends Entity {
  name = VarChar();
  color = VarChar();
}

class Bar extends Entity {
  value = Int();
  color = VarChar();
}

it("will emit where clauses", () => {
  class Test extends Entity {
    a = Int();
    b = Int();
    c = Int();
    d = Int();
  }

  const query = new Query(where => {
    const test = where(Test);

    where(test.a).is(1);
    where(test.b).not(2);
    where(test.c).greater(3);
    where(test.d).less(4);

    return where.get(test.a);
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Test\`.\`a\` AS \`1\`
FROM
  \`Test\`
WHERE
  \`Test\`.\`a\` = 1
  AND \`Test\`.\`b\` <> 2
  AND \`Test\`.\`c\` > 3
  AND \`Test\`.\`d\` < 4
`);
})

it("will assert a joined property's value", () => {
  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });

    where(bar.value).is(42);

    return where.get(foo.name);
  });
  
  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
  JOIN \`Bar\` ON \`Bar\`.\`color\` = \`Foo\`.\`color\`
WHERE
  \`Bar\`.\`value\` = 42
`);
})

it.skip("will assert an implictly joined value", () => {
  class Bar extends Entity {
    foo = One(Foo);
    greeting = "Hello World";
  }

  const query = new Query(where => {
    const bar = where(Bar);

    where(bar.foo.color).is("blue");

    return where.get(bar.greeting);
  });
  
  expect(query).toMatchInlineSnapshot();
})

it("will match values via object", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo).has({
      name: "Gabe",
      color: "blue"
    })

    return where.get(foo.name);
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
WHERE
  \`Foo\`.\`name\` = 'Gabe'
  AND \`Foo\`.\`color\` = 'blue'
`)
})

it("will group multiple clauses", async () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where.any(
      where.all(
        where(foo.name).not("Danny"),
        where(foo.color).is("red"),
      ),
      where.all(
        where(foo.name).is("Gabe"),
        where(foo.color).is("green")
      )
    );

    return where.get(foo.name);
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`Foo\`.\`name\` AS \`1\`
FROM
  \`Foo\`
WHERE
  (
    \`Foo\`.\`name\` <> 'Danny'
    AND \`Foo\`.\`color\` = 'red'
  )
  OR (
    \`Foo\`.\`name\` = 'Gabe'
    AND \`Foo\`.\`color\` = 'green'
  )
`);
})