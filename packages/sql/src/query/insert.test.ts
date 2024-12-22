import { Num, Str, Type } from '..';
import { TestConnection } from '../tests';

class Foo extends Type {
  name = Str();
  color = Str();
}

class User extends Type  {
  name = Str();
  email = Str();
  age = Num();
}

it("will insert procedurally generated rows", async () => {
  await new TestConnection([User]);

  const names = ["john", "jane", "bob", "alice"];
  const insert = User.insert(names, (name, i) => ({
    name,
    age: i + 25,
    email: `${name.toLowerCase()}@email.org`
  }));

  expect(insert).toMatchInlineSnapshot(`
    INSERT INTO
      user (age, email, name)
    SELECT
      25 AS age,
      'john@email.org' AS email,
      'john' AS name
    UNION ALL
    SELECT
      26 AS age,
      'jane@email.org' AS email,
      'jane' AS name
    UNION ALL
    SELECT
      27 AS age,
      'bob@email.org' AS email,
      'bob' AS name
    UNION ALL
    SELECT
      28 AS age,
      'alice@email.org' AS email,
      'alice' AS name
  `);

  await expect(insert).resolves.toBe(4);

  const results = User.get();

  await expect(results).resolves.toMatchObject([
    { "id": 1, "name": "john",  "email": "john@email.org",  "age": 25 },
    { "id": 2, "name": "jane",  "email": "jane@email.org",  "age": 26 },
    { "id": 3, "name": "bob",   "email": "bob@email.org",   "age": 27 },
    { "id": 4, "name": "alice", "email": "alice@email.org", "age": 28 }
  ]);
})

it("will throw for bad value", async () => {
  const insert = () => (
    Foo.insert({
      name: "foobar",
      // @ts-expect-error
      color: 3
    }) 
  )

  expect(insert).toThrowErrorMatchingInlineSnapshot(`
    Provided value for Foo.color but not acceptable for type varchar(255).
    Value must be a string.
  `);
})

it("will throw for no value non-nullable", async () => {
  const insert = () => (
    // @ts-expect-error
    Foo.insert({ name: "foobar" }) 
  )

  expect(insert).toThrowErrorMatchingInlineSnapshot(`
    Provided value for Foo.color but not acceptable for type varchar(255).
    Column color requires a value but got undefined.
  `);
})

it("will add index to specify error", async () => {
  const insert = () => (
    Foo.insert([
      { name: "foo", color: "red" },
      // @ts-expect-error
      { name: "bar" }
    ]) 
  )

  expect(insert).toThrowErrorMatchingInlineSnapshot(`
    Provided value for Foo.color at [1] but not acceptable for type varchar(255).
    Column color requires a value but got undefined.
  `);
})
