import {
  Bool,
  Int,
  Many,
  One,
  VarChar,
  Entity
} from "../src";

class Author extends Entity {
  name = VarChar();
  age = Int();
  nickname = VarChar({ nullable: true });
  active = Bool();
  books = Many(Book);
}

class Book extends Entity {
  title = VarChar();
  author = One(Author); 
}

Author.init();
Book.init();

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

  const sql = query.commit().toSQL();

  expect(sql).toMatchInlineSnapshot(`
    "select
      \`title\`
    from
      \`Book\`
      left join \`Author\` on \`Author\`.\`id\` = \`authorID\`
    where
      title = '1984'
      and Author.age > 50"
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

  const sql = query.commit().toSQL();

  expect(sql).toMatchInlineSnapshot(`
    "select
      \`nickname\`,
      \`age\`
    from
      \`Author\`
    where
      name <> 'Robert'
      and nickname = 'Bob'
      and age > 3
      and active = true"
  `);
})