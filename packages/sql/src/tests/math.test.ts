import { Num, Query, Type } from '..';

class Item extends Type  {
  number = Num();
}

describe("arithmetic", () => {
  it("will select equation", () => {
    const results = Query((where, fn) => {
      const { add } = fn;
      const item = where(Item);

      return add(item.number, 2)
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number + 2
      FROM
        item
    `);
  })

  it("will select multiple equations", () => {
    const results = Query((where, fn) => {
      const { add, sub, mul, div } = fn;
      const item = where(Item);

      return {
        add: add(item.number, 2),
        sub: sub(item.number, 2),
        mul: mul(item.number, 2),
        div: div(item.number, 2)
      }
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number + 2 AS "add",
        item.number - 2 AS "sub",
        item.number * 2 AS "mul",
        item.number / 2 AS "div"
      FROM
        item
    `);
  });

  it("will properly nest", async () => {
    const results = Query((where, fn) => {
      const { add, mul, neg } = fn;
      const { number } = where(Item);

      return {
        a: mul(number, add(number, 5)),
        b: add(mul(number, 5), number),
        c: neg(add(number, 100))
      }
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number * (item.number + 5) AS "a",
        item.number * 5 + item.number AS "b",
        - (item.number + 100) AS "c"
      FROM
        item
    `);
  });
})