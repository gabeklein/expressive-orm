import { Table, str, one, notNull } from "../tests/Table";

describe("get", () => {
  class User extends Table {
    static table = "user";

    name = str(notNull);
  }

  class Post extends Table {
    static table = "post";

    title = str(notNull);
    user = one(User, notNull);
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
    user = one(User, notNull);
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

  it("will update relation by object", async () => {
    const post = await Post.new({ title: "Hello World", user: user.id });

    await post.update({ user: { name: "Bob" } });
  });
})

describe("query", () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User, notNull);
  }

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

      INSERT INTO "user" (id, name)
      VALUES (1, 'Gabe'), (2, 'Alice'), (3, 'Bob');

      INSERT INTO "post" (id, title, user_id)
      VALUES (1, 'Hello World', 1), (2, 'Second Post', 1), (3, 'Another Post', 2);
    `);
  });

  it("will search for relation by id", async () => {
    const post = await Post.one({ user: 1 });

    expect(post.id).toBe(1);
    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(1);
    expect(post.user.name).toBe("Gabe");
  })

  it("will search for relation by instance", async () => {
    const gabe = await User.one(1);
    const post = await Post.one({ user: gabe });

    expect(post.id).toBe(1);
    expect(post.user).toBeInstanceOf(User);
  })

  it("will search for relation by query", async () => {
    const post = await Post.one({ user: { name: "Gabe" } });

    expect(post.id).toBe(1);
    expect(post.title).toBe("Hello World");
  })
})

describe("lazy", () => {
  class User extends Table {
    static table = "user";

    name = str();
  }

  class Post extends Table {
    static table = "post";

    title = str();
    user = one(User, { lazy: true });
  }

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

      INSERT INTO "user" (name)
      VALUES ('Gabe');

      INSERT INTO "post" (title, user_id)
      VALUES ('Hello World', 1);
    `);
  });

  it("will lazy load relation", async () => {
    const post = await Post.one({ title: "Hello World" }, true);
    
    expect(() => post.user).toThrow(expect.any(Promise))
  })
})

describe("OneToOneField and lazy field logic", () => {
  it("should throw a promise when accessing a lazy field and resolve correctly", async () => {
    // TODO: Create a model with a lazy field, access it, catch thrown promise, await and check value
  });

  it("should use cache for OneToOneField relation if available", async () => {
    // TODO: Create related entities, check that relation uses cache
  });

  it("should handle errors when relation loading fails", async () => {
    // TODO: Try to load a relation with missing/invalid id, expect error
  });

  it("should return a function for lazy relations and resolve correctly", async () => {
    // TODO: Create a lazy relation, check that returned value is a function, call and check result
  });

  it("should return cached instance if present, otherwise load it", async () => {
    // TODO: Insert entity, check cached returns instance, remove from cache, check loads from DB
  });
});