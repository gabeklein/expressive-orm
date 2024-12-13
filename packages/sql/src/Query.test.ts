import { Type, Num, Query } from '..';
import { inMemoryDatabase } from './tests';

class Item extends Type  {
  number = Num();
}

inMemoryDatabase([Item], async () => {
  await Item.insert(10, i => ({ number: i }));
});

describe("where", () => {
  it("will limit results", async () => {
    const results = Query(where => {
      const item = where(Item);

      where(item.number).more(3);
      where.limit(5);

      return item.number;
    });

    expect(results).toMatchInlineSnapshot(`
      SELECT
        item.number
      FROM
        item
      WHERE
        item.number > 3
      LIMIT
        5
    `);

    expect(await results).toEqual([4, 5, 6, 7, 8]);
  });

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