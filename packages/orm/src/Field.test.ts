import { expect, it } from 'vitest';

import { Field } from './Field';

it("will pass values through by default", async () => {
  const field = new Field("fooBar", { length: 3 }, null);

  expect(field.column).toBe("foo_bar");
  expect(field.length).toBe(3);
  expect(field.nullable).toBe(true);
  expect(field.set("a")).toBe("a");
  expect(field.get("a")).toBe("a");
})
