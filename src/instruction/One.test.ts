import Entity from '../Entity';
import Query from '../Query';
import Int from './Int';
import One from './One';
import String from './String';

it("will query nested relationships", () => {
  class A extends Entity {
    b = One(B);
  }
  class B extends Entity {
    c = One(C);
  }
  class C extends Entity {
    value = Int();
    label = String();
  }

  // TODO: fix types
  const query = new Query(where => {
    const a = where.from(A);

    where.equal(a.b.c.value, 100);
    
    return () => a.b.c.label;
  })

  expect(query).toMatchInlineSnapshot(`
SELECT
  \`C\`.\`label\` AS \`S1\`
FROM \`A\`
LEFT JOIN \`B\`
  ON \`B\`.\`id\` = \`A\`.\`bId\`
LEFT JOIN \`C\`
  ON \`C\`.\`id\` = \`B\`.\`cId\`
WHERE
  \`C\`.\`value\` = 100
`);
})