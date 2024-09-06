import { Type, Num, Query, Str } from '@expressive/sql';
import { TestConnection } from './database';

class User extends Type  {
  name = Str();
  email = Str();
  age = Num();
}

function random(min: number, max: number) {
  const u = Math.max(min, max);
  const l = Math.min(min, max);
  const diff = u - l;
  const r = Math.floor(Math.random() * (diff + 1));
  return l + r; 
}

TestConnection.prepare([ User ]);

it.skip("will insert procedurally generated rows", async () => {
  const names = [
    "Gabe",
    "Justin",
    "Joe",
    "Steven",
    "Josiah"
  ];

  await User.insert(names, (name) => ({
    name,
    age: random(20, 35),
    email: `${name.toLowerCase()}@email.org`
  }));

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