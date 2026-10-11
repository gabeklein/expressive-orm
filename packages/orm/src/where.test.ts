import { expect, it } from 'vitest';

import { num, str, uuid } from './fields';
import { memory } from './memory';
import { Type } from './Type';
import * as where from './where';

class User extends Type {
  static connection = memory();

  name = str();
  age = num(null);
  key = uuid(null);
}

const ready = (async () => {
  for (const [name, age] of [["Gabe", 30], ["Alice", 25], ["Bob", undefined]] as const)
    await User.insert({ name, age });
})();

it.each([
  ["equal", where.equal(25), [2]],
  ["notEqual", where.notEqual(25), [1]],
  ["greaterThan", where.greaterThan(25), [1]],
  ["lessThan", where.lessThan(30), [2]],
  ["greaterThanOrEqual", where.greaterThanOrEqual(25), [1, 2]],
  ["lessThanOrEqual", where.lessThanOrEqual(25), [2]],
  ["isIn", where.isIn([25, 30]), [1, 2]],
  ["notIn", where.notIn([25]), [1]],
  ["isNull", where.isNull(), [3]],
  ["notNull", where.notNull(), [1, 2]],
  ["asc", where.asc(), [3, 2, 1]],
  ["desc", where.desc(), [1, 2, 3]]
])("will filter by %s", async (_, condition, expected) => {
  await ready;
  const users = await User.find({ age: condition });

  expect(users.map(x => x.id)).toEqual(expected);
})

it("will filter by isLike", async () => {
  await ready;
  const users = await User.find({ name: where.isLike("%a%") });

  expect(users.map(x => x.name)).toEqual(["Gabe"]);
})
