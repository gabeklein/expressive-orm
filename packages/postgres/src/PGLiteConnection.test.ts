import { Num, Query, Str, Type } from '@expressive/sql';

import { TestConnection } from './TestConnection';

class Users extends Type {
  name = Str();
  age = Num();
}

it("will select rows", async () => {
  await new TestConnection([Users]);

  await Users.insert([
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
    { name: "Joe", age: 21 },
  ])

  const query = Users.get((user) => user.name);

  expect(query).toMatchInlineSnapshot(`
    SELECT
      users.name
    FROM
      users
  `);

  expect(query).resolves.toEqual(["John", "Jane", "Joe"]);
})

it("will update from data", async () => {
  await new TestConnection([Users]);

  await Users.insert([
    { name: "John", age: 0 },
    { name: "Jane", age: 0 },
    { name: "Joe", age: 0 },
  ])

  const data = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  const query = Query.from(data, (where, input) => {
    const user = where(Users);

    where(user.name).is(input.name);
    where(user).update({ age: input.age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
      "input" AS (
        SELECT
          *
        FROM
          JSON_TO_RECORDSET($1) AS x (NAME VARCHAR(255), age INT)
      )
    UPDATE
      "users"
    SET
      "age" = "input"."age"
    FROM
      "input"
    WHERE
      "users"."name" = "input"."name"
  `);

  await expect(query).resolves.toBe(2);
  await expect(Users.get()).resolves.toEqual([
    { id: 3, name: "Joe", age: 0 },
    { id: 1, name: "John", age: 30 },
    { id: 2, name: "Jane", age: 25 },
  ]);
})

it.todo("will prevent reserved words as table names");