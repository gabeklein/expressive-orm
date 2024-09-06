import { Bool, Entity, Many, Num, One, Str } from '@expressive/sql';
import { bootstrap } from '../bootstrap';

it("will create tables", () => {
  class Author extends Entity {
    id = Num();
    name = Str();
    age = Num();
    nickname = Str({ nullable: true });
    active = Bool();
    books = Many(Book);
    publisher = One(Publisher);
  }
  
  class Publisher extends Entity {
    id = Num();
    name = Str();
  }
  
  class Book extends Entity {
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