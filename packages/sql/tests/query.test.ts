import { Query, Str, Time, Type } from '../src';
import { inMemoryDatabase } from '.';

class Foo extends Type {
  name = Str();
  date = Time();
  color = Str();
}

it("will insert and retrieve a Date", async () => {
  await inMemoryDatabase([Foo]);

  const now = new Date();

  await Foo.insert({
    name: "foobar",
    color: "red",
    date: now
  })

  const date = await Query.one(where => {
    const foo = where(Foo);

    where(foo.id).is(1);

    return foo.date;
  });

  // database has limited precision
  now.setMilliseconds(0);

  // asserts Date type is preserved also
  expect<Date>(date).toBeInstanceOf(Date);
  expect<Date>(date).toEqual(now);
})

it("will create count query", () => {
  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  });

  const qb = query.count();

  expect(qb).toMatchSnapshot();
})