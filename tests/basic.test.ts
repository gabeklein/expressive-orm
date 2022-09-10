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
  const query = new Query($ => {
    const book = $.from(Book);

    book.title.is("1984");
    book.author.age.isMore(50);

    return () => ({
      title: book.title
    })
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
"select
  \`title\` as \`$1\`
from
  \`Book\`
  LEFT JOIN \`Author\` ON \`Author\`.\`id\` = \`authorId\`
where
  \`title\` = '1984'
  and \`Author\`.\`age\` > 50"
`);
})

it.skip("will create author query", () => {
  const query = new Query($ => {
    const author = $.from(Author);

    author.name.isNot("Robert");
    author.nickname.is("Bob");
    author.age.isMore(3);
    author.active.is(true);

    return () => ({
      name: author.nickname,
      age: author.age
    })
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
"select
  \`nickname\` as \`$1\`,
  \`age\` as \`$2\`
from
  \`Author\`
where
  \`name\` <> 'Robert'
  and \`nickname\` = 'Bob'
  and \`age\` > 3
  and \`active\` = 1"
`);
})