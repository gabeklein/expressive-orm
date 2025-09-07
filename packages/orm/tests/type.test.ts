import { Table, str } from "./Table";

it("will allow for methods", async () => {
  await Table.connection.init(`
    CREATE TABLE IF NOT EXISTS "user" (
      id SERIAL PRIMARY KEY,
      name TEXT
    );  
  `);

  const didGreet = vi.fn();

  class User extends Table {
    static table = "user";

    name = str();

    greet() {
      didGreet(`Hello, ${this.name}`);
    }
  }

  const user = await User.new({ name: "John" }, true);

  expect(user.id).toBe(1);
  expect(user.name).toBe("John");

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John");

  await user.update({ name: "John Doe" });

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John Doe");
})