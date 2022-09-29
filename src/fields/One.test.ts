import Entity, { Int, One, Select, VarChar } from '../';

class A extends Entity {
  b = One(B);
  value = VarChar();
}

class B extends Entity {
  c = One(C);
}

class C extends Entity {
  value = Int();
  label = VarChar();
}

it("will query via select function", () => {
  const query = new Select(where => {
    const a = where.from(A);
    return () => a.value;
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`A\`.\`value\` AS \`1\`
FROM
  \`A\`
  LEFT JOIN \`B\` ON \`B\`.\`id\` = \`A\`.\`bId\`
  LEFT JOIN \`C\` ON \`C\`.\`id\` = \`B\`.\`cId\`
`);
})

it("will query via select function", () => {
  const query = new Select(where => {
    const a = where.from(A);

    return {
      aValue: a.value,
      cValue: a.b.c.value
    };
  });

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`A\`.\`value\` AS \`aValue\`,
  \`C\`.\`value\` AS \`cValue\`
FROM
  \`A\`
  LEFT JOIN \`B\` ON \`B\`.\`id\` = \`A\`.\`bId\`
  LEFT JOIN \`C\` ON \`C\`.\`id\` = \`B\`.\`cId\`
`);
})

it("will query nested relationships", () => {
  // TODO: fix types
  const query = new Select(where => {
    const a = where.from(A);

    where.equal(a.b.c.value, 100);
    
    return a.b.c.label;
  })

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`C\`.\`label\` AS \`1\`
FROM
  \`A\`
  LEFT JOIN \`B\` ON \`B\`.\`id\` = \`A\`.\`bId\`
  LEFT JOIN \`C\` ON \`C\`.\`id\` = \`B\`.\`cId\`
WHERE
  \`C\`.\`value\` = 100
`);
})