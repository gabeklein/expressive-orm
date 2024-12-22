import { Num, Query, Type } from '..';

class Item extends Type  {
  number = Num();
}

describe("arithmetic", () => {
  it("will select", () => {
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

  it("will properly nest", async () => {
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