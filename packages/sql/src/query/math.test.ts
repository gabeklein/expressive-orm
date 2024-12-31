import { Num, Query, Type, math } from '..';

class Item extends Type  {
  number = Num();
}

describe("arithmetic", () => {
  it("will select", () => {
    const results = Query(where => {
      const item = where(Item);

      return {
        add: math.add(item.number, 2),
        sub: math.sub(item.number, 2),
        mul: math.mul(item.number, 2),
        div: math.div(item.number, 2)
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
    const results = Query((where) => {
      const { add, mul, neg } = math;
      const { number } = where(Item);

      return {
        a: mul(number, add(number, 5)),
        b: add(mul(number, 5), number),
        c: neg(add(number, 100))
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