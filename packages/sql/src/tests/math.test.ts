import { Num, Query, Table } from '..';

class Item extends Table  {
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

describe("templates", () => {
  it("will select", async () => {
    const results = Query((where, fn) => {
      const { number } = where(Item);

      return {
        a: fn(`${number} * (${number} + 5)`),
        b: fn(`${number} * 5 + ${number}`),
        c: fn(`-(${number} + 100)`)
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

  // it("will filter", async () => {
  //   const results = Query((where) => {
  //     const { number } = where(Item);

  //     where(`${number} * (${number} + 5)`).over(5);
  //     where(`${number} * 5 + ${number}`).under(5);
  //     where(`-(${number} + 100)`).under(-100);
  //   });

  //   expect(results).toMatchInlineSnapshot();
  // });
})