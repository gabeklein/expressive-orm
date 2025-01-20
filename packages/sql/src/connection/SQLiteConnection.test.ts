import { Num } from '../columns/Num';
import { Str } from '../columns/Str';
import { TestConnection } from '../connection/TestConnection';
import { Query } from '../query/Query';
import { Type } from '../type/Type';

it("will update from data", async () => {
  class User extends Type {
    name = Str();
    age = Num();
  }

  interface Data {
    name: string;
    age: number;
  }

  const data: Data[] = [
    { name: "John", age: 30 },
    { name: "Jane", age: 25 },
  ];

  await new TestConnection([User]);

  const query = Query.from(data, (where, input) => {
    const user = where(User);

    where(user.name).is(input.name);
    where(user).update({ age: input.age });
  });

  expect(query).toMatchInlineSnapshot(`
    WITH
      input AS (
        SELECT
          VALUE -> 0 AS name,
          VALUE -> 1 AS age
        FROM
          json_each (?)
      )
    UPDATE
      user
    SET
      age = input.age
    FROM
      input
    WHERE
      user.name = input.name
  `)
})