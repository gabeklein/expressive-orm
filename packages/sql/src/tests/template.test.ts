import { Query, Str, Type } from '..';
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
    where(foo.color).equal(color);
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
    where(foo.first).equal(firstname);
    where(foo.color).equal(color);
    
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