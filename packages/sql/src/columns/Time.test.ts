import { Time, Type } from '../..';
import { inMemoryDatabase } from '../tests';

class Foo extends Type {
  date = Time();
}

it("will insert and retrieve a Date", async () => {
  await inMemoryDatabase([Foo]);

  const now = new Date();

  // database has limited precision
  now.setMilliseconds(0);

  await Foo.insert({ date: now })

  const date = await Foo.one((foo, where) => {
    where(foo.id).equal(1);

    return foo.date;
  });

  // Date type should be preserved
  expect<Date>(date).toBeInstanceOf(Date);
  expect<Date>(date).toEqual(now);
})