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
  const query = Query.select(where => {
    const book = where.from(Book);

    where.equal(book.title, "1984");
    where.greater(book.author, 50);

    return book.title;
  })

  expect(query).toMatchInlineSnapshot();
})

it("will create author query", () => {
  const query = Query.select(where => {
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

  expect(sql).toMatchInlineSnapshot(`
SELECT
  \`Author\`.\`nickname\` AS \`1\`,
  \`Author\`.\`age\` AS \`2\`
FROM \`Author\`
LEFT JOIN \`Publisher\`
  ON \`Publisher\`.\`id\` = \`Author\`.\`publisherId\`
WHERE
  \`Author\`.\`name\` <> 'Robert' AND
  \`Author\`.\`age\` = 3 AND
  \`Author\`.\`nickname\` = 'Bob' AND
  \`Author\`.\`active\` = 1
`);
})