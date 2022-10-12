import { Bool, Entity, Int, Many, One, Query, VarChar } from '../src';

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
}

//TODO: fix
it.skip("will create book query", () => {
  const query = new Query(where => {
    const book = where(Book);

    where(book.title).is("1984");
    where(book.id).greater(50);

    return where.get(book.title);
  })

  expect(query).toMatchInlineSnapshot();
})

it("will create author query", () => {
  const query = new Query(where => {
    const author = where(Author);

    where(author.name).not("Robert");
    where(author.age).is(3);
    where(author.nickname).is("Bob");
    where(author.active).is(true);

    return where.get(() => ({
      name: author.nickname,
      age: author.age
    }))
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
SELECT
  \`Author\`.\`nickname\` AS \`1\`,
  \`Author\`.\`age\` AS \`2\`
FROM
  \`Author\`
  LEFT JOIN \`Publisher\` ON \`Publisher\`.\`id\` = \`Author\`.\`publisherId\`
WHERE
  \`Author\`.\`name\` <> 'Robert'
  AND \`Author\`.\`age\` = 3
  AND \`Author\`.\`nickname\` = 'Bob'
  AND \`Author\`.\`active\` = 1
`);
})