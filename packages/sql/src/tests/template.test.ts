import { Query, Type, Time } from '..';

it("will preprocess params", async () => {
  class Thing extends Type {
    created = Time();
  }

  const template = Query(where => (created: Date) => {
    const thing = where(Thing);
    where(thing.created).is(created);
  });

  const query = template(new Date("2020-01-01"));

  expect(query.params).toEqual(['2020-01-01 00:00:00']);
});