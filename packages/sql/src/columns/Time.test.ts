import { Query, Time, Type } from '../..';
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

  const date = await Query.one(where => {
    const foo = where(Foo);

    where(foo.id).is(1);

    return foo.date;
  });

  // Date type should be preserved
  expect<Date>(date).toBeInstanceOf(Date);
  expect<Date>(date).toEqual(now);
})