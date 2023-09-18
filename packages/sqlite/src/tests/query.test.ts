import { Entity, Date as Time, Number, Query, String } from '@expressive/sql';
import { TestConnection } from './database';

const seconds = (date: Date) => {
  return Math.floor(date.getTime() / 1000);
}

class Foo extends Entity {
  id = Number();
  name = String();
  date = Time();
}

TestConnection.prepare([ Foo ]);

it("will insert and retrieve a Date", async () => {
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

  expect(date).toBeInstanceOf(Date);
  expect(seconds(now)).toBe(seconds(date!));
})