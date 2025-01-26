import { Type, Num } from '..';

class Item extends Type  {
  number = Num();
}

describe("get method", () => {
  it("will fetch rows", async () => {
    const query = Item.get();

    expect(query).toMatchInlineSnapshot(`
      SELECT
        item.id AS "id",
        item.number AS "number"
      FROM
        item
    `);
  })

  it("will limit rows", async () => {
    const query = Item.get(5);

    expect(query).toMatchInlineSnapshot(`
      SELECT
        item.id AS "id",
        item.number AS "number"
      FROM
        item
      LIMIT
        5
    `);
  })

  it("will query rows", async () => {
    const query = Item.get((item, where) => {
      where(item.number).over(5);
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        item.id AS "id",
        item.number AS "number"
      FROM
        item
      WHERE
        item.number > 5
    `);
  })

  it("will limit queried rows", async () => {
    const query =  Item.get(2, (item, where) => {
      where(item.number).over(5);
    });

    expect(query).toMatchInlineSnapshot(`
      SELECT
        item.id AS "id",
        item.number AS "number"
      FROM
        item
      WHERE
        item.number > 5
      LIMIT
        2
    `);
  })
})