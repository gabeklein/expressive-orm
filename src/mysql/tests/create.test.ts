import { Bool, Entity, Int, Many, One } from '../..';
import MySQLConnection from '../Connection';

it("will create tables", () => {
  class Author extends Entity {
    name = String();
    age = Int();
    nickname = String({ nullable: true });
    active = Bool();
    books = Many(Book);
    publisher = One(Publisher);
  }
  
  class Publisher extends Entity {
    name = String();
  }
  
  class Book extends Entity {
    title = String();
    author = One(Author);
    rating = Int();
  }

  const connection =
    new MySQLConnection({
      dry: true,
      use: [
        Author,
        Book,
        Publisher
      ]
    });

  const sql = connection.createTables(true);

  expect(sql).toMatchSnapshot();
})