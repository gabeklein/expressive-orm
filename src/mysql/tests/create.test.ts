import { Bool, Entity, Int, Many, One, VarChar } from '../..';
import { bootstrap } from '../bootstrap';

it("will create tables", () => {
  class Author extends Entity {
    name = VarChar();
    age = Int();
    nickname = VarChar({ nullable: true });
    active = Bool();
    books = Many(Book);
    publisher = One(Publisher);
  }
  
  class Publisher extends Entity {
    name = VarChar();
  }
  
  class Book extends Entity {
    title = VarChar();
    author = One(Author);
    rating = Int();
  }

  const sql = bootstrap([
    Author,
    Book,
    Publisher
  ])

  expect(sql).toMatchSnapshot();
})