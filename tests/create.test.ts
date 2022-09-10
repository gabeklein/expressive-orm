import { format } from 'sql-formatter';
import { Bool, Entity, Int, Many, One } from '../src';
import MySQLConnection from '../src/mysql/Connection';

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
      dry: true
    }, {
      Author,
      Book,
      Publisher
    });

  const sql = connection.createTables();

  expect(format(sql)).toMatchInlineSnapshot(`
    CREATE TABLE
      IF NOT EXISTS Author (
        \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`age\` INT NOT NULL,
        \`active\` TINYINT NOT NULL,
        \`publisherId\` INT NOT NULL
      );

    CREATE TABLE
      IF NOT EXISTS Book (
        \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`authorId\` INT NOT NULL,
        \`rating\` INT NOT NULL
      );

    CREATE TABLE
      IF NOT EXISTS Publisher (\`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY);

    ALTER TABLE
      Author
    ADD
      CONSTRAINT \`FK_PublisherAuthor\` FOREIGN KEY (publisherId) REFERENCES Publisher(id);

    ALTER TABLE
      Book
    ADD
      CONSTRAINT \`FK_AuthorBook\` FOREIGN KEY (authorId) REFERENCES Author(id)
`);
})