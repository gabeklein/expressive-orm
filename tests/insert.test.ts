import { Entity, Int, Query, String } from '../src';
import { TestConnection } from './database';

class User extends Entity  {
  name = String();
  email = String();
  age = Int();
}

function random(min: number, max: number) {
  const u = Math.max(min, max);
  const l = Math.min(min, max);
  const diff = u - l;
  const r = Math.floor(Math.random() * (diff + 1)); //'+1' because Math.random() returns 0..0.99, it does not include 'diff' value, so we do +1, so 'diff + 1' won't be included, but just 'diff' value will be.
  
  return l + r; //add the random number that was selected within distance between low and up to the lower limit.  
}

TestConnection.create([ User ]);

it.skip("will insert procedurally generated rows", async () => {
  const names = [
    "Gabe",
    "Justin",
    "Joe",
    "Steven",
    "Josiah"
  ];

  await User.insert(names, (name) => {
    return {
      name,
      age: random(20, 35),
      email: `${name.toLowerCase()}@fennec-engineering.com`
    }
  });

  const results = await Query.get(where => where(User))

  void results;

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