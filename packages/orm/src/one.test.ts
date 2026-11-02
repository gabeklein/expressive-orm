import { describe, expect, it } from 'vitest';

import { memory } from './memory';
import { lazy, one } from './one';
import { Type } from './Type';
import { str } from './fields';

function connect(){
  return class Table extends Type {
    static connection = memory();
  }
}

describe("get", () => {
  it("will eager load relation", async () => {
    class Table extends connect() {}

    class User extends Table {
      static table = "user";
      name = str();
    }

    class Post extends Table {
      static table = "post";
      title = str();
      user = one(User);
    }

    await Table.connection.insert("user", { name: "John Doe" });
    await Table.connection.insert("post", { title: "Hello World", user_id: 1 });

    const post = await Post.one({ title: "Hello World" }, true);

    expect(post.id).toBe(1);
    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(1);
    expect(post.user.name).toBe("John Doe");
  });

  it("will be undefined if optional", async () => {
    class User extends connect() {
      static table = "user";
      name = str();
    }

    class Post extends User {
      static table = "post";
      title = str();
      user = one(User, null);
    }

    await Post.connection.insert("post", { title: "Hello World", user_id: null });

    const post = await Post.one({ title: "Hello World" }, true);

    expect(post.id).toBe(1);
    expect(post.user).toBeUndefined();
  });

  it("will throw if required relation is missing", async () => {
    class User extends connect() {
      name = str();
    }

    class Post extends User {
      static table = "post";
      user = one(User);
    }

    await Post.connection.insert("post", { name: "Hello World" });

    await expect(Post.one()).rejects.toThrow("Missing required relation: User");
  });

  it("will annotate failed relation", async () => {
    const db = memory();

    class User extends Type {
      static connection = { ...db, get: () => Promise.reject(new Error("offline")) };
      static table = "user";
      name = str();
    }

    class Post extends Type {
      static connection = db;
      static table = "post";
      user = one(User);
    }

    await db.insert("post", { user_id: 9 });

    await expect(Post.one()).rejects.toThrow("Failed to load relation User for user: offline");
  });

  it("will pass through non-error rejection", async () => {
    const db = memory();

    class User extends Type {
      static connection = { ...db, get: () => Promise.reject("offline") };
      static table = "user";
      name = str();
    }

    class Post extends Type {
      static connection = db;
      static table = "post";
      user = one(User);
    }

    await db.insert("post", { user_id: 9 });

    await expect(Post.one()).rejects.toBe("offline");
  });
})

describe("insert", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    user = one(User);
  }

  const ready = User.insert({ name: "John Doe" });

  it("will insert relation by id", async () => {
    const user = await ready;
    const post = await Post.insert({ title: "Hello World", user: user.id });

    expect(post.user).toBe(user);
  })

  it("will insert relation by instance", async () => {
    const user = await ready;
    const post = await Post.insert({ title: "Hello World", user });

    expect(post.user).toBe(user);
  })

  it("will throw if required relation is missing", async () => {
    // @ts-expect-error
    const post = Post.insert({ title: "Hello World" });

    await expect(post).rejects.toThrow("Missing required relation: User");
  })

  it("will throw if relation is unsaved", async () => {
    const post = Post.insert({ title: "Hello World", user: User.new({ name: "Bob" }) });

    await expect(post).rejects.toThrow("Cannot assign unsaved User to user_id");
  })

  it("will create relation by insert object", async () => {
    const post = await Post.insert({ title: "Hello World", user: { name: "Jane Doe" } });

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(2);
    expect(post.user.name).toBe("Jane Doe");
  })

  it("will update relation by object", async () => {
    const user = await ready;
    const post = await Post.insert({ title: "Hello World", user: user.id });

    await post.update({ user: { name: "Bob" } });

    const [row] = await Post.connection.get("post", [["id", "=", post.id]]);
    const bob = await User.one({ name: "Bob" });

    expect(row.user_id).toBe(bob.id);
  });
})

describe("nullable", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    user = one(User, null);
  }

  it("will insert null relation", async () => {
    const post = await Post.insert({ title: "Hello World", user: null as any });

    expect(post.user).toBeUndefined();
  })
})

describe("query", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    user = one(User);
  }

  const ready = (async () => {
    for (const name of ["Gabe", "Alice", "Bob"])
      await Table.connection.insert("user", { name });

    await Table.connection.insert("post", { title: "Hello World", user_id: 1 });
    await Table.connection.insert("post", { title: "Second Post", user_id: 1 });
    await Table.connection.insert("post", { title: "Another Post", user_id: 2 });
  })();

  it("will search for relation by id", async () => {
    await ready;
    const post = await Post.one({ user: 1 });

    expect(post.id).toBe(1);
    expect(post.user).toBeInstanceOf(User);
    expect(post.user.id).toBe(1);
    expect(post.user.name).toBe("Gabe");
  })

  it("will search for relation by instance", async () => {
    await ready;
    const gabe = await User.one(1);
    const post = await Post.one({ user: gabe });

    expect(post.id).toBe(1);
    expect(post.user).toBe(gabe);
  })

  it("will search for relation by query", async () => {
    await ready;
    const post = await Post.one({ user: { name: "Alice" } });

    expect(post.id).toBe(3);
    expect(post.title).toBe("Another Post");
  })
})

describe("lazy", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    user = one(User, lazy);
  }

  const ready = (async () => {
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("post", { title: "Hello World", user_id: 1 });
  })();

  it("will lazy load relation", async () => {
    await ready;
    const post = await Post.one({ title: "Hello World" }, true);

    let pending: unknown;

    try {
      post.user;
    }
    catch (thrown) {
      pending = thrown;
    }

    expect(pending).toBeInstanceOf(Promise);
    expect(() => post.user).toThrow(expect.any(Promise));

    await pending;

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.name).toBe("Gabe");
  })

  it("will reset lazy relation on reload", async () => {
    await ready;
    const post = await Post.one({ title: "Hello World" }, true);

    expect(() => post.user).toThrow(expect.any(Promise));
  })
})

describe("relationships", () => {
  it("will not infer from ambiguous relations", async () => {
    const { get } = await import('./get');

    class Table extends connect() {}

    class User extends Table {
      static table = "user";
      posts = get(Post);
    }

    class Post extends Table {
      static table = "post";
      author = one(User);
      editor = one(User);
    }

    const user = await User.insert({});

    expect(() => user.posts).toThrow("There are multiple relationships");
  })
})
