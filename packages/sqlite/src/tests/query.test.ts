import { Type, Time, Num, Query, Str } from '@expressive/sql';
import { TestConnection } from './database';
import { seconds } from './helpers';

class Foo extends Type {
  id = Num();
  name = Str();
  date = Time();
}

beforeAll(() => {
  TestConnection.attach([ Foo ]);
})

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