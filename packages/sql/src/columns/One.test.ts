import { Num, One, Query, Str, Type } from '..';

class A extends Type {
  b = One(B);
  value = Str();
}

class B extends Type {
  c = One(C);
  value = Str();
}

class C extends Type {
  value = Num();
  label = Str();
}

it("will query via direct selection", () => {
  const query = Query(where => {
    return where(A).b.value;
  });

  expect(query).toMatchInlineSnapshot(`
    select
      \`b\`.\`value\` as \`value\`
    from
      \`a\`
      inner join \`b\` on \`b\`.\`id\` = \`a\`.\`b_id\`
  `);
})

it("will select via an object", () => {
  const query = Query(where => {
    const a = where(A);

    return {
      aValue: a.value,
      cValue: a.b.c.value
    }
  });

  expect(query).toMatchInlineSnapshot(`
    select
      \`a\`.\`value\` as \`aValue\`,
      \`c\`.\`value\` as \`cValue\`
    from
      \`a\`
      inner join \`b\` on \`b\`.\`id\` = \`a\`.\`b_id\`
      inner join \`c\` on \`c\`.\`id\` = \`b\`.\`c_id\`
  `);
})

it("will query nested relationships", () => {
  const query = Query(where => {
    const a = where(A);

    where(a.b.c.value).is(100);
    
    return a.b.c.label;
  })

  expect(query).toMatchInlineSnapshot(`
    select
      \`c\`.\`label\` as \`label\`
    from
      \`a\`
      inner join \`b\` on \`b\`.\`id\` = \`a\`.\`b_id\`
      inner join \`c\` on \`c\`.\`id\` = \`b\`.\`c_id\`
    where
      \`c\`.\`value\` = 100
  `);
})