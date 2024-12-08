import { Type, Num, Str } from '..';
import { inMemoryDatabase } from '.';

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
  await inMemoryDatabase([User]);

  const names = ["Foo", "Bar", "Baz", "Bob"];

  await User.insert(
    names.map((name, i) => ({
      name,
      age: i + 25,
      email: `${name.toLowerCase()}@email.org`
    }))
  );

  // const results = await Query.get(where => where(User))

  // void results;

  // const authors: any[] = [];
  // const books: any[] = [];

  // for(const authorName of ["Gabe", "BJ", "JC", "Danny"]){
  //   const author = new Author();

  //   author.name = authorName;
  //   authors.push(author);

  //   for(const name of ["Foo", "Bar", "Baz"]){
  //     const book = new Book();

  //     book.title = name;
  //     book.author = author;
      
  //     books.push(book);
  //   }
  // }

  // connection.insert([ ...authors, ...books ])
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
    Column requires a value but got undefined.
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
    Column requires a value but got undefined.
  `);
})

it.todo("will warn in typescript for bad value");
it.todo("will warn in typescript for no value non-nullable");