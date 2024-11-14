import { Query, Str, Time, Type } from '../';
import { inMemoryDatabase } from '.';

class Foo extends Type {
  name = Str();
  date = Time();
  color = Str();
}

it("will insert and retrieve a Date", async () => {
  await inMemoryDatabase([Foo]);

  const now = new Date();

  // database has limited precision
  now.setMilliseconds(0);

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

  // Date type should be preserved
  expect<Date>(date).toBeInstanceOf(Date);
  expect<Date>(date).toEqual(now);
})

it("will create count query", () => {
  const query = Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  });

  const qb = query.toString();

  expect(qb).toMatchInlineSnapshot(`
    select
      count(*)
    from
      \`foo\`
    where
      \`foo\`.\`color\` = 'red'
  `);
})

it.todo("will reject query via select function")