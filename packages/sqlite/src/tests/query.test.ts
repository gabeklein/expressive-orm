import { Type, Time, Query, Str } from '@expressive/sql';
import { database } from './helpers';

class Foo extends Type {
  name = Str();
  date = Time();
}

it("will insert and retrieve a Date", async () => {
  await database([Foo]);

  const now = new Date();

  await Foo.insert({
    name: "foobar",
    date: now
  })

  const date = await Query.one(where => {
    const foo = where(Foo);

    where(foo.id).is(1);

    return foo.date;
  });

  // database has limited precision
  now.setMilliseconds(0);

  expect(date).toBeInstanceOf(Date);
  expect(date).toEqual(now);
})