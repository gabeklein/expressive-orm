import { Table, str, asc, greaterThan } from "./Table";

describe("one", () => {
  class User extends Table {
    static table = "users";

    name = str();
  }

  beforeAll(() => {
    Table.connection.reset();
    Table.connection.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT
      );

      INSERT INTO users (id, name)
      VALUES (1, 'Gabe'), (2, 'Alice'), (3, 'Bob');
    `);
  });

  it("will get record by id", async () => {
    const user = await User.one(2);

    expect(user.id).toBe(2);
  });

  it("will get latest record", async () => {
    const user = await User.one();

    expect(user.id).toBe(3);
  });

  it("will get ascending result", async () => {
    const user = await User.one({ id: asc() });

    expect(user.id).toBe(1);
  });

  it("will both match and sort", async () => {
    const user = await User.one({
      id: [asc(), greaterThan(1)],
    });

    expect(user.id).toBe(2);
  });

  it("will search for match", async () => {
    const user = await User.one({ name: "Gabe" });

    expect(user.id).toBe(1);
  });

  it("will throw on no match", async () => {
    const query = User.one({ name: "Foo" });

    await expect(query).rejects.toThrow();
  });

  it("will return undefined if optional", async () => {
    const user = await User.one({ name: "Foo" }, false);

    expect(user).toBeUndefined();
  });
});
