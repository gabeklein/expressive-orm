import { Bool, Type, Many, Num, One, Str } from '@expressive/sql';
import { bootstrap } from '../bootstrap';

it("will create tables", () => {
  class Author extends Type {
    id = Num();
    name = Str();
    age = Num();
    nickname = Str({ nullable: true });
    active = Bool();
    books = Many(Book);
    publisher = One(Publisher);
  }
  
  class Publisher extends Type {
    id = Num();
    name = Str();
  }
  
  class Book extends Type {
    id = Num();
    title = Str();
    author = One(Author);
    rating = Num();
  }

  const sql = bootstrap([
    Author,
    Book,
    Publisher
  ])

  expect(sql).toMatchSnapshot();
})