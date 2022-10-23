import { Boolean, Entity, Many, Number, One, String } from '../..';
import { bootstrap } from '../bootstrap';

it("will create tables", () => {
  class Author extends Entity {
    name = String();
    age = Number();
    nickname = String({ nullable: true });
    active = Boolean();
    books = Many(Book);
    publisher = One(Publisher);
  }
  
  class Publisher extends Entity {
    name = String();
  }
  
  class Book extends Entity {
    title = String();
    author = One(Author);
    rating = Number();
  }

  const sql = bootstrap([
    Author,
    Book,
    Publisher
  ])

  expect(sql).toMatchSnapshot();
})