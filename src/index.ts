import Bool from './columns/Bool';
import Int from './columns/Int';
import Many from './columns/Many';
import One from './columns/One';
import VarChar from './columns/VarChar';
import Entity from './entity';

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

Author.register();

export async function something(){
  return Author.getOne({
    where(){
      this.name.isNot("gabe");
      this.nickname.is("gabe");
      this.age.isMore(3);
      this.active.is(true);
    },
    select(){
      return {
        name: this.nickname,
        age: this.age,
        status: this.active ? "active" : "inactive"
      } as const
    }
  });
}

console.clear()
something();