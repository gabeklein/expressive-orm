import { Type, Num } from '..';
import { inMemoryDatabase } from './tests';

class Item extends Type  {
  number = Num();
}

inMemoryDatabase([Item], async () => {
  await Item.insert(10, i => ({ number: i }));
});

describe("get method", () => {
  it("will fetch rows", async () => {
    const results = await Item.get();

    expect(results).toHaveLength(10); 
  })

  it("will limit rows", async () => {
    const results = await Item.get(5);

    expect(results).toHaveLength(5); 
  })

  it("will query rows", async () => {
    const results = await Item.get((item, where) => {
      where(item.number).isMore(5);
    });

    expect(results).toMatchObject([
      { number: 6 },
      { number: 7 },
      { number: 8 },
      { number: 9 },
    ]);
  })

  it("will limit queried rows", async () => {
    const results = await Item.get(2, (item, where) => {
      where(item.number).isMore(5);
    });

    expect(results).toMatchObject([
      { number: 6 },
      { number: 7 },
    ]);
  })
})