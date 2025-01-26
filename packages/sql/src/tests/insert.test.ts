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
