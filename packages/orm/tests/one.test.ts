import { Table, str, one } from "./Table";

describe("get", () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User);
  }
  
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

})

describe("insert", () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User);
  }

  let user: User;
  
  beforeAll(async () => {
    await Table.connection.init(`
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY,
        name TEXT
      );

      CREATE TABLE IF NOT EXISTS "post" (
        id SERIAL PRIMARY KEY,
        title TEXT,
        user_id INTEGER REFERENCES "user"(id)
      );
    `)

    user = await User.new({ name: "John Doe" });
  })

  it("will insert relation by id", async () => {
    const post = await Post.new({ title: "Hello World", user: user.id });

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(1);
    expect(post.user.name).toBe("John Doe");
  })

  it("will insert relation by instance", async () => {
    const post = await Post.new({ title: "Hello World", user });

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(1);
    expect(post.user.name).toBe("John Doe");
  })

  it("will throw if required relation is missing", async () => {
    // @ts-expect-error
    const post = Post.new({ title: "Hello World" });

    await expect(post).rejects.toThrow("Missing required relation: User");
  })

  it("will create relation by insert object", async () => {
    const post = await Post.new({ title: "Hello World", user: { name: "Jane Doe" } });

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(2);
    expect(post.user.name).toBe("Jane Doe");
  })
})

