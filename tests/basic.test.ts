import {
  Bool,
  Int,
  Many,
  One,
  String,
  Entity,
  Query
} from "../src";

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
}

it.skip("will create book query", () => {
  const query = new Query(where => {
    const book = where.from(Book);

    where.equal(book.title, "1984");
    where.greater(book.author, 50);

    return () => ({
      title: book.title
    })
  })

  expect(query).toMatchInlineSnapshot();
})

it.skip("will create author query", () => {
  const query = new Query(where => {
    const author = where.from(Author);

    where.notEqual(author.name, "Robert");
    where.equal(author.age, 3);
    where.equal(author.nickname, "Bob");
    where.equal(author.active, true);

    return () => ({
      name: author.nickname,
      age: author.age
    })
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot();
})