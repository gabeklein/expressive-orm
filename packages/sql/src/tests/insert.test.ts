import { Str, Type } from '..';

class Foo extends Type {
  name = Str();
  color = Str();
}

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
  const insert = () => {
    // @ts-expect-error
    Foo.insert({ name: "foobar" }) 
  }

  expect(insert).toThrowErrorMatchingInlineSnapshot(
    `Can't assign to \`Foo.color\`. A value is required but got undefined.`
  );
})

it("will add index to specify error", async () => {
  const insert = () => {
    Foo.insert([
      { name: "foo", color: "red" },
      // @ts-expect-error
      { name: "bar" }
    ]) 
  }

  expect(insert).toThrowErrorMatchingInlineSnapshot(`
    A provided value at \`color\` at index [1] is not acceptable.
    Can't assign to \`Foo.color\`. A value is required but got undefined.
  `);
})
