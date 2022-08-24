import { Entity, Many, One } from "../src";

class Author extends Entity {
  name = String();
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

it.skip("will insert procedurally generated rows", () => {
  const authors = [];
  const books = [];

  for(const authorName of ["Gabe", "BJ", "JC", "Danny"]){
    const author = new Author();

    author.name = authorName;
    authors.push(author);

    for(const name of ["Foo", "Bar", "Baz"]){
      const book = new Book();

      book.title = name;
      book.author = author;
      
      books.push(book);
    }
  }

  // connection.insert([ ...authors, ...books ])
})