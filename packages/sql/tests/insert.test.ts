import { Type, Query, Str } from '..';

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

  expect(insert).toThrowErrorMatchingSnapshot();
})

it("will throw for no value non-nullable", async () => {
  const insert = () => (
    // TODO: This should also have a type warning.
    //// @ts-expect-error
    Foo.insert({
      name: "foobar"
    }) 
  )

  expect(insert).toThrowErrorMatchingSnapshot();
})

it("will add index to specify error", async () => {
  const insert = () => (
    Foo.insert([
      {
        name: "foo",
        color: "red"
      },
      // TODO: This should also have a type warning.
      //// @ts-expect-error
      {
        name: "bar"
      }
    ]) 
  )

  expect(insert).toThrowErrorMatchingSnapshot();
})

it.todo("will warn in typescript for bad value");
it.todo("will warn in typescript for no value non-nullable");