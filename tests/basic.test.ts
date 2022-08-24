import {
  Bool,
  Int,
  Many,
  One,
  String,
  Entity
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

it("will create book query", () => {
  const query = Book.query({
    where(){
      this.title.is("1984");
      this.author.age.isMore(50);
    },
    select(){
      return this.title;
    }
  })

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
    "select
      \`title\`
    from
      \`Book\`
      left join \`Author\` on \`Author\`.\`id\` = \`authorId\`
    where
      \`title\` = '1984'
      and \`Author\`.\`age\` > 50"
  `);
})

it("will create author query", () => {
  const query = Author.query({
    where(){
      this.name.isNot("Robert");
      this.nickname.is("Bob");
      this.age.isMore(3);
      this.active.is(true);
    },
    select(){
      return {
        name: this.nickname,
        age: this.age
      } as const
    }
  });

  const sql = query.toString();

  expect(sql).toMatchInlineSnapshot(`
    "select
      \`nickname\`,
      \`age\`
    from
      \`Author\`
    where
      \`name\` <> 'Robert'
      and \`nickname\` = 'Bob'
      and \`age\` > 3
      and \`active\` = true"
  `);
})