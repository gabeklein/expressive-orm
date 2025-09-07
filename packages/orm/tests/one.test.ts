import { Table, str, one } from "./Table";

beforeEach(async () => {
  await Table.connection.init(`
    CREATE TABLE IF NOT EXISTS "user" (
      id SERIAL PRIMARY KEY,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS "post" (
      id SERIAL PRIMARY KEY,
      title TEXT,
      user_id INTEGER REFERENCES "user"(id)
    );`)
})

it("will eager load relation", async () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User);
  }

  await Table.connection.exec(`
    INSERT INTO "user" (name)
    VALUES ('John Doe');

    INSERT INTO "post" (title, user_id)
    VALUES ('Hello World', 1);
  `);

  const post = await Post.one({ title: "Hello World" }, true);

  expect(post.id).toBe(1);
  expect(post.user).toBeInstanceOf(User);
  expect(post.user.id).toBe(1);
  expect(post.user.name).toBe("John Doe");
});

it("will be undefined if optional", async () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User, null);
  }

  await Table.connection.exec(`
    INSERT INTO "post" (title, user_id)
    VALUES ('Hello World', NULL);
  `);

  const post = await Post.one({ title: "Hello World" }, true);

  expect(post.id).toBe(1);
  expect(post.user).toBeUndefined();
});
