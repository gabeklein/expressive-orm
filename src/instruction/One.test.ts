import Entity from '../Entity';
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

  const query = A.query({
    where(){
      this.b.c.value.is(100);
    },
    select(){
      return this.b.c.label;
    }
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
"select
  \`C\`.\`label\` as \`$1\`
from
  \`A\`
  LEFT JOIN \`B\` ON \`B\`.\`id\` = \`bId\`
  LEFT JOIN \`C\` ON \`C\`.\`id\` = \`cId\`
where
  \`C\`.\`value\` = 100"
`);
})