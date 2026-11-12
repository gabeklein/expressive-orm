import { Context, Model } from '@expressive/mvc';
import { describe, expect, it, vi } from 'vitest';

import type { Connection } from './Connection';
import { Memory } from './memory';
import { lazy, one } from './one';
import { Type } from './Type';
import { str } from './fields';

function caught(read: () => unknown){
  try {
    return read();
  }
  catch (thrown) {
    return thrown;
  }
}

async function rejects(pending: unknown){
  const release = Model.on({ catch(){} });

  try {
    return await Promise.resolve(pending).then(() => undefined, error => error);
  }
  finally {
    release();
  }
}

function spy<K extends "select" | "insert" | "update" | "remove">(connection: Connection, key: K) {
  void connection[key];
  return vi.spyOn(connection, key);
}

function connect(){
  return class Table extends Type {
    static connection = Memory.new();
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

    const post = await Post.get(1);

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

    const post = await Post.get(1);

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

    await expect(rejects(Post.get(1))).resolves.toEqual(new Error("Missing required relation: User"));
  });

  it("will annotate failed relation", async () => {
    const db = Memory.new();

    class User extends Type {
      static connection = Object.assign(Memory.new(), { select: () => Promise.reject(new Error("offline")) });
      static table = "user";
      name = str();
    }

    class Post extends Type {
      static connection = db;
      static table = "post";
      user = one(User);
    }

    await db.insert("post", { user_id: 9 });

    await expect(rejects(Post.get(1))).resolves.toEqual(new Error("Failed to load relation User for user: offline"));
  });

  it("will pass through non-error rejection", async () => {
    const db = Memory.new();

    class User extends Type {
      static connection = Object.assign(Memory.new(), { select: () => Promise.reject("offline") });
      static table = "user";
      name = str();
    }

    class Post extends Type {
      static connection = db;
      static table = "post";
      user = one(User);
    }

    await db.insert("post", { user_id: 9 });

    await expect(rejects(Post.get(1))).resolves.toBe("offline");
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

    expect(post.user).toBe(user.id);
  })

  it("will insert relation by row", async () => {
    const user = await ready;
    const post = await Post.insert({ title: "Hello World", user });

    expect(post.user).toBe(user.id);
  })

  it("will insert relation by instance", async () => {
    const user = await User.get((await ready).id);
    const post = await Post.insert({ title: "Hello World", user });

    expect(post.user).toBe(user.id);
  })

  it("will throw if required relation is missing", async () => {
    // @ts-expect-error
    const post = Post.insert({ title: "Hello World" });

    await expect(post).rejects.toThrow("Missing required relation: User");
  })

  it("will throw if relation is not inserted", async () => {
    const user = User.new({ name: "Ben" });
    const post = Post.insert({ title: "Hello World", user });

    await expect(post).rejects.toThrow("Cannot assign unsaved User to user_id");
    await user;
  })

  it("will create relation by insert object", async () => {
    const post = await Post.insert({ title: "Hello World", user: { name: "Jane Doe" } });
    const jane = await User.one({ name: "Jane Doe" });

    expect(post.user).toBe(jane.id);
  })

  it("will update relation by object", async () => {
    const user = await ready;
    const { id } = await Post.insert({ title: "Hello World", user: user.id });
    const post = await Post.get(id);

    await post.set({ user: { name: "Bob" } });

    const [row] = await Post.connection.select("post", [["id", "=", post.id]]);
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
    const post = await Post.insert({ title: "Hello World", user: null });

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

    expect(post.columns).toEqual({ id: 2, title: "Second Post", user: 1 });
  })

  it("will search for relation by instance", async () => {
    await ready;
    const gabe = await User.get(1);
    const post = await Post.one({ user: gabe });

    expect(post.id).toBe(2);
  })

  it("will search for relation by row", async () => {
    await ready;
    const alice = await User.one({ id: 2 });
    const post = await Post.one({ user: alice });

    expect(post.id).toBe(3);
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

  async function seed(){
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("post", { title: "Hello World", user_id: 1 });
  }

  const ready = seed();

  it("will suspend until loaded", async () => {
    await ready;
    const post = await Post.get(1);
    const get = spy(Table.connection, "select");

    expect(get).not.toHaveBeenCalled();

    const pending = caught(() => post.user);

    expect(pending).toBeInstanceOf(Promise);
    expect(pending).toMatchObject({
      name: "Suspense",
      message: `${post}.user is not yet available.`
    });

    expect(() => post.user).toThrow(expect.any(Promise));

    const user = await pending;

    expect(get).toHaveBeenCalledTimes(1);

    expect(user).toBeInstanceOf(User);
    expect(post.user).toBe(user);
    expect(post.user.name).toBe("Gabe");

    get.mockRestore();
  })

  it("will notify observers when loaded", async () => {
    await ready;
    const post = await Post.get(1);
    const effect = vi.fn((state: Post) => {
      return void state.user.name;
    });

    User.loaded.clear();
    await post.set({ user: 1 });
    post.get(effect);

    expect(effect).toHaveBeenCalledTimes(1);

    await expect.poll(() => effect.mock.calls.length).toBe(2);
    expect(post.user.name).toBe("Gabe");
  })

  it("will resolve async effect when loaded", async () => {
    await ready;
    const post = await Post.get(1);

    const get = spy(Table.connection, "select");

    User.loaded.clear();
    await post.set({ user: 1 });

    const user = await post.get(async ($) => $.user);

    expect(get).toHaveBeenCalledTimes(1);
    expect(user).toBeInstanceOf(User);
    expect(user.is).toBe(post.user);
    expect(user.name).toBe("Gabe");

    get.mockRestore();
  })

  it("will resolve from identity map", async () => {
    await ready;
    const user = await User.get(1);

    Post.loaded.clear();

    const post = await Post.get(1);

    expect(post.user).toBe(user);
  })

  it("will be undefined if row is missing", async () => {
    await ready;
    const post = await Post.new({ title: "Orphan", user: 1 });

    await post.set({ user: 9 });

    await caught(() => post.user);

    expect(post.user).toBeUndefined();
  })

  it("will discard load superseded by assignment", async () => {
    await ready;
    const post = await Post.new({ title: "Draft", user: 1 });

    User.loaded.clear();

    const other = await User.new({ name: "Other" });
    const { connection } = Table;
    const select = connection.select.bind(connection);
    const held = spy(connection, "select");
    let release!: () => void;

    held.mockImplementationOnce(async (...args) => {
      await new Promise<void>(res => release = res);
      return select(...args);
    });

    await post.set({ user: 1 });

    const pending = caught(() => post.user);

    await post.set({ user: other });
    release();

    await expect(pending).resolves.toBe(other);
    await new Promise(res => setTimeout(res));

    expect(post.user).toBe(other);

    held.mockRestore();
  })

  it("will throw on read if load fails", async () => {
    const db = Memory.new();

    class User extends Type {
      static connection = Object.assign(Memory.new(), { select: () => Promise.reject(new Error("offline")) });
      static table = "user";
      name = str();
    }

    class Post extends Type {
      static connection = db;
      static table = "post";
      user = one(User, lazy);
    }

    await db.insert("post", { user_id: 9 });

    const post = await Post.get(1);

    await caught(() => post.user);

    expect(() => post.user).toThrow("Failed to load relation User for user: offline");

    await post.set({ user: 9 });

    const pending = caught(() => post.user);

    expect(pending).toBeInstanceOf(Promise);

    await caught(() => post.user);
    await new Promise(res => setTimeout(res));

    expect(() => post.user).toThrow("Failed to load relation User for user: offline");

    const user = await User.new({ name: "Bob" });

    await post.set({ user });

    expect(post.user).toBe(user);
  })
})

describe("references", () => {
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
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("post", { title: "First", user_id: 1 });
    await Table.connection.insert("post", { title: "Second", user_id: 1 });
  })();

  it("will share one instance between parents", async () => {
    await ready;
    const [first, second] = await Promise.all([Post.get(1), Post.get(2)]);

    expect(first.user).toBeInstanceOf(User);
    expect(first.user).toBe(second.user);
  })

  it("will not destroy related entity with parent", async () => {
    await ready;
    const user = await User.get(1);
    const first = await Post.new({ title: "Third", user });
    const second = await Post.new({ title: "Fourth", user });
    const destroyed = vi.fn();

    user.set(null, destroyed);
    first.set(null);

    expect(destroyed).not.toHaveBeenCalled();
    expect(second.user).toBe(user);

    await expect(user.set({ name: "Bob" })).resolves.toEqual(["name"]);
  })

  it("will not join parent context", async () => {
    await ready;
    const user = await User.get(1);
    const post = await Post.new({ title: "Fifth", user });
    const context = new Context({ post });

    await post.set({ user });

    expect(post.user).toBe(user);
    expect(context.get(User, false)).toBeUndefined();
    expect(Context.get(user)).toBe(Context.root);

    context.pop();
  })

  it("will not dispatch for same relation", async () => {
    await ready;
    const post = await Post.get(1);
    const user = post.user;

    await expect(post.set({ user })).resolves.toEqual([]);
  })

  it("will dispatch when relation changes", async () => {
    await ready;
    const post = await Post.get(1);
    const other = await User.new({ name: "Other" });

    await expect(post.set({ user: other })).resolves.toEqual(["user"]);
  })

  it("will update relation in place", async () => {
    await ready;
    const post = await Post.get(2);

    await post.set({ user: { name: "Carol" } });

    expect(post.user).toBeInstanceOf(User);
    expect(post.user.name).toBe("Carol");
  })
})

describe("config", () => {
  it("will name the column after the property", () => {
    class User extends connect() {}

    class Post extends connect() {
      author = one(User);
      editor = one(User, null);
    }

    expect([Post.fields.get("author")!.column, Post.fields.get("editor")!.column]).toEqual(["author_id", "editor_id"]);
  })

  it("will throw if two fields use one column", () => {
    class User extends connect() {}

    class Post extends connect() {
      author = one(User);
      writer = one(User, { column: "author_id" });
    }

    expect(() => Post.fields).toThrow("Post.author and Post.writer both use column author_id.");
  })

  it("will record referential actions", () => {
    class User extends connect() {}

    class Post extends connect() {
      user = one(User, { onDelete: "cascade", onUpdate: "restrict", column: "author" });
    }

    expect(Post.fields.get("user")).toMatchObject({
      column: "author",
      onDelete: "cascade",
      onUpdate: "restrict",
      nullable: false
    });
  })

  it("will apply lazy after defaults", () => {
    class User extends connect() {}

    class Post extends connect() {
      user = one(User, lazy);
    }

    expect(Post.fields.get("user")).toMatchObject({ lazy: true });
  })
})
