import Entity, { DateTime, Query, VarChar } from "../src";
import { TestConnection } from "./database";

const Color = () => VarChar({
  oneOf: ["red", "blue", "green"]
});

class Foo extends Entity {
  name = VarChar();
  date = DateTime();
  color = Color();
}

class Bar extends Entity {
  name = VarChar();
  date = DateTime();
  color = Color();
}

new TestConnection([Foo, Bar]);

it("will insert and retrieve a Date", async () => {
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
  const now = new Date();

  await Foo.insert({
    name: "foobar",
    date: now,
    color: "red"
  })

  const item = await Query.run(where => {
    const foo = where(Foo);

    where(foo.id).is(1);

    return where.has(foo);
  });

  expect(seconds(now)).toBe(seconds(item.date));
})