import { Table, str } from "./Table";

class User extends Table {
  static table = 'users';

  name = str();
}

it("will get a record by id", async () => {
  await Table.connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT
    );

    INSERT INTO users (id, name) VALUES (1, 'Gabe')
  `)

  const user = await User.one();
  expect(user.id).toBe(1);
  expect(user.name).toBe('Gabe');
});