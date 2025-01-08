import { Query, Str, Type, Time } from '..';
import { TestConnection } from '../connection/TestConnection';

class Foo extends Type {
  first = Str();
  last = Str();
  color = Str();
}

new TestConnection([Foo], async () => {
  await Foo.insert([
    { first: "John", last: "Doe",   color: "red" },
    { first: "Jane", last: "Smith", color: "blue" },
  ])
});

it("will create a template", async () => {
  const query = Query(where => (color: string) => {
    const foo = where(Foo);
    where(foo.color).is(color);
    return foo.first;
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      foo.first
    FROM
      foo
    WHERE
      foo.color = ?
  `);

  await expect(query("red")).resolves.toEqual(["John"]);
  await expect(query("blue")).resolves.toEqual(["Jane"]);
})

it("will preserve params order", async () => {
  const query = Query(where => (
    color: string, firstname: string
  ) => {
    const foo = where(Foo);

    // Should sorts parameters by order of
    // usage despite the order of arguments.
    where(foo.first).is(firstname);
    where(foo.color).is(color);
    
    return foo.last;
  });

  expect(query).toMatchInlineSnapshot(`
    SELECT
      foo.last
    FROM
      foo
    WHERE
      foo.first = ?
      AND foo.color = ?
  `);

  await expect(query("red", "John")).resolves.toEqual(["Doe"]);
  await expect(query("blue", "Jane")).resolves.toEqual(["Smith"]);
})

it("will select a parameter value", async () => {
  const query = Query(() => (color: string) => color);

  expect(query).toMatchInlineSnapshot(`
    SELECT
      ? AS VALUE
  `);
});

it("will select a parameter value", async () => {
  const query = Query(() => (color: string) => ({ color }));

  expect(query).toMatchInlineSnapshot(`
    SELECT
      ? AS color
  `);
});

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