import { Num, Str, Type } from "..";
import { inMemoryDatabase } from "./";

class User extends Type {
  name = Str();
  email = Str();
  age = Num();
}

it("will create a table", async () => {
  await inMemoryDatabase([ User ]);

  await User.insert({
    name: "Gabe",
    email: "gabe@email.org",
    age: 25
  });
})