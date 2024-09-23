import { Bool, Type, Many, Num, One, Str } from '@expressive/sql';
// import { MySQLConnection } from '../Connection';

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

// TODO: implement a way to extract query instead of executing.
it.todo("will create tables", () => {
  // const connection =
  //   new MySQLConnection().attach([
  //     Author,
  //     Book,
  //     Publisher
  //   ]);

  // const sql = bootstrap([
  //   Author,
  //   Book,
  //   Publisher
  // ])

  // expect(sql).toMatchSnapshot();
})