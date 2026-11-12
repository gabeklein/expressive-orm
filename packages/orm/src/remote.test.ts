import { describe, expect, it, vi } from 'vitest';

import { key, num, str } from './fields';
import { Memory } from './memory';
import { one } from './one';
import { Remote } from './remote';
import { Type } from './Type';
import { greaterThan } from './where';

function pair(){
  class Author extends Type {
    static table = "people";
    name = str({ column: "full_name" });
    bio = str(null);
  }

  class Post extends Type {
    static table = "articles";
    author = one(Author);
    title = str();
    views = num({ fallback: 0 });
  }

  const server = Memory.new({ Author, Post });
  const serve = Remote.handle(server);
  const send = vi.fn((request: Remote.Request) => serve(structuredClone(request)));

  const a = class extends Type {
    name = str();
  };

  const b = class extends Type {
    author = one(a);
    title = str();
    views = num({ fallback: 0 });
  };

  Remote.new({ Author: a, Post: b }, send);

  return { server, send, Author: a, Post: b };
}

describe("Remote", () => {
  it("will write and read through the far side's tables", async () => {
    const { server, Author, Post } = pair();
    const ann = await Author.new({ name: "Ann" });

    await Post.new({ author: ann, title: "Hello" });

    await expect(server.select("people", [])).resolves.toEqual([{ id: 1, full_name: "Ann" }]);
    await expect(server.select("articles", [])).resolves.toEqual([{ id: 1, author_id: 1, title: "Hello", views: 0 }]);

    const post = await Post.get(1);

    expect(post.title).toBe("Hello");
    expect((await post.author).name).toBe("Ann");
  })

  it("will send properties, not columns", async () => {
    const { send, Author, Post } = pair();
    const ann = await Author.new({ name: "Ann" });

    await Post.new({ author: ann, title: "Hello" });
    send.mockClear();

    await Post.query({ author: ann, views: greaterThan(-1) });

    expect(send).toHaveBeenCalledWith({
      op: "select",
      type: "Post",
      where: [["author", "=", 1], ["views", ">", -1]],
      limit: undefined,
      offset: 0
    });
  })

  it("will update and delete by id", async () => {
    const { server, Author } = pair();
    const ann = await Author.new({ name: "Ann" });

    await ann.set({ name: "Anne" });
    await expect(server.select("people", [])).resolves.toEqual([{ id: 1, full_name: "Anne" }]);

    await ann.delete();
    await expect(server.select("people", [])).resolves.toEqual([]);
  })

  it("will upsert by property", async () => {
    const { server, send, Post } = pair();

    await Post.insert({ author: 1, title: "Hello" });
    await Post.insert({ id: 1, author: 1, title: "Changed" }, { conflict: "update" });

    expect(send).toHaveBeenLastCalledWith({
      op: "insert",
      type: "Post",
      data: { id: 1, author: 1, title: "Changed", views: 0 },
      returns: true,
      conflict: { on: ["id"], update: ["author", "title"], set: {} }
    });

    await expect(server.select("articles", [])).resolves.toEqual([{ id: 1, author_id: 1, title: "Changed", views: 0 }]);
  })

  it("will drop columns the near side does not declare", async () => {
    const { server, Author } = pair();

    await server.insert("people", { full_name: "Ann", bio: "hidden", secret: "x" });

    await expect(Author.query()).resolves.toEqual([{ id: 1, name: "Ann" }]);
  })

  it("will send a composite key by its parts", async () => {
    class Tag extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
    }

    const server = Memory.new({ Tag });

    const app = class extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
    };

    Remote.new({ Tag: app }, Remote.handle(server));

    await app.insert({ post: 1, name: "a" });

    await expect(app.get([1, "a"])).resolves.toMatchObject({ post: 1, name: "a" });
    await expect(server.select("tag", [])).resolves.toEqual([{ post: 1, name: "a" }]);
  })

  it("will throw if a class is not bound by key", async () => {
    class Foo extends Type {}

    Remote.new([Foo], vi.fn());

    await expect(Foo.query()).rejects.toThrow("Type Foo is not bound by key, so it cannot be sent.");
  })

  it("will throw if a table is not used", async () => {
    const db = Remote.new({}, vi.fn());

    await expect(db.remove("foo", 1)).rejects.toThrow("Table foo is not used by this connection.");
  })

  it("will reject an unknown class", async () => {
    const serve = Remote.handle(Memory.new());

    await expect(serve({ op: "remove", type: "Foo", id: 1 })).rejects.toThrow("Type Foo is not served by this connection.");
  })

  it("will reject an unknown property", async () => {
    class Foo extends Type {
      name = str();
    }

    const serve = Remote.handle(Memory.new({ Foo }));

    await expect(serve({ op: "update", type: "Foo", id: 1, data: { password: "x" } })).rejects.toThrow("Foo has no property password.");
    await expect(serve({ op: "select", type: "Foo", where: [["password", "=", "x"]] })).rejects.toThrow("Foo has no property password.");
  })

  it("will reject an unknown column", async () => {
    class Foo extends Type {}

    const db = Remote.new({ Foo }, vi.fn());

    await expect(db.select("foo", [["bar", "=", 1]])).rejects.toThrow("Foo has no column bar.");
  })

  it("will reject an unknown request", async () => {
    class Foo extends Type {}

    const serve = Remote.handle(Memory.new({ Foo }));

    await expect(serve({ op: "drop", type: "Foo" } as any)).rejects.toThrow("Unsupported request: drop");
  })

  it("will not return a row unless asked", async () => {
    const { send, Post } = pair();
    const db = Post.connection;

    await expect(db.insert(Post.ref, { author_id: 1, title: "Hello" })).resolves.toBeUndefined();
    expect(send).toHaveBeenLastCalledWith({ op: "insert", type: "Post", data: { author: 1, title: "Hello" }, returns: undefined });
  })
})
