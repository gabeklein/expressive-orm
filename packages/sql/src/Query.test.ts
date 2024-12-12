import { Type, Num, Query } from '..';
import { inMemoryDatabase } from './tests';

class Item extends Type  {
  number = Num();
}

inMemoryDatabase([Item], async () => {
  await Item.insert(10, i => ({ number: i }));
});

describe("where", () => {
  it("will add operator clauses", () => {
    const results = Query(where => {
      const item = where(Item);

      where(item.number).equal(5);
      where(item.number).not(0);
      where(item.number).more(4);
      where(item.number).more(5, true);
      where(item.number).less(6);
      where(item.number).less(5, true);
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        count(*)
      FROM
        item
      WHERE
        item.number = 5
        AND item.number <> 0
        AND item.number > 4
        AND item.number >= 5
        AND item.number < 6
        AND item.number <= 5
    `);
  });
})

describe("arithmetic", () => {
  it("will select arithmetic", () => {
    const results = Query(where => {
      const item = where(Item);

      return {
        add: where.add(item.number, 2),
        sub: where.sub(item.number, 2),
        mul: where.mul(item.number, 2),
        div: where.div(item.number, 2)
      }
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number + 2 AS add,
        item.number - 2 AS sub,
        item.number * 2 AS mul,
        item.number / 2 AS div
      FROM
        item
    `);
  });

  it("will properly nest arithmetic", async () => {
    const results = Query(({ is, add, mul, neg }) => {
      const item = is(Item);

      return {
        a: mul(item.number, add(item.number, 5)),
        b: add(mul(item.number, 5), item.number),
        c: neg(add(item.number, 100))
      }
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number * (item.number + 5) AS a,
        item.number * 5 + item.number AS b,
        - (item.number + 100) AS c
      FROM
        item
    `);
  });
})