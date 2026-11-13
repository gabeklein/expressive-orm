import { describe, expect, it, vi } from 'vitest';

import { bool, date, key, num, str } from './fields';
import { Memory } from './memory';
import { one } from './one';
import { Remote } from './remote';
import { Type } from './Type';
import { greaterThan } from './where';

function pair(options?: Remote.Options){
  class Author extends Type {
    static table = "people";
    name = str({ column: "full_name" });
    hash = str(null);
  }

  class Post extends Type {
    static table = "articles";
    author = one(Author);
    title = str();
    views = num({ fallback: 0 });
  }

  const server = Memory.new({ Author, Post });
  const serve = Remote.handle(server, options);
  const send = vi.fn((request: Remote.Request) => serve(structuredClone(request), "me"));

  const a = class extends Type {
    name = str();
  };

  const b = class extends Type {
    author = one(a);
    title = str();
    views = num({ fallback: 0 });
  };

  Remote.new({ Author: a, Post: b }, send);

  return { server, serve, send, Author: a, Post: b };
}

describe("client", () => {
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
      conflict: { on: ["id"], update: ["author", "title"] }
    });

    await expect(server.select("articles", [])).resolves.toEqual([{ id: 1, author_id: 1, title: "Changed", views: 0 }]);
  })

  it("will leave an existing row on conflict", async () => {
    const { server, send, Post } = pair();

    await Post.insert({ author: 1, title: "Hello" });
    await expect(Post.insert({ id: 1, author: 1, title: "Changed" }, { conflict: "ignore" })).resolves.toBeUndefined();

    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ conflict: { on: ["id"], update: [] } }));
    await expect(server.select("articles", [])).resolves.toMatchObject([{ title: "Hello" }]);
  })

  it("will drop properties it does not declare", async () => {
    const { server, Author } = pair();

    await server.insert("people", { full_name: "Ann", hash: "x" });

    await expect(Author.query()).resolves.toEqual([{ id: 1, name: "Ann" }]);
  })

  it("will send ordering without a value", async () => {
    const { send, Author } = pair();

    await Author.query();

    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ where: [["id", "desc"]] }));
  })

  it("will not return a row unless asked", async () => {
    const { send, Post } = pair();
    const db = Post.connection;

    await expect(db.insert(Post.ref, { author_id: 1, title: "Hello" })).resolves.toBeUndefined();
    expect(send).toHaveBeenLastCalledWith({ op: "insert", type: "Post", data: { author: 1, title: "Hello" }, returns: undefined });
  })

  it("will send a composite key by property", async () => {
    class Tag extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
      note = str(null);
    }

    const server = Memory.new({ Tag });
    const send = vi.fn(Remote.handle(server));

    const app = class extends Type {
      id = key(() => [this.name, this.post]);
      post = num();
      name = str();
      note = str(null);
    };

    Remote.new({ Tag: app }, send);

    await app.insert({ post: 1, name: "a" });
    await app.update(["a", 1] as any, { note: "n" });

    expect(send).toHaveBeenLastCalledWith({ op: "update", type: "Tag", id: { name: "a", post: 1 }, data: { note: "n" } });
    await expect(server.select("tag", [])).resolves.toEqual([{ post: 1, name: "a", note: "n" }]);

    await app.delete(["a", 1] as any);
    await expect(server.select("tag", [])).resolves.toEqual([]);
  })

  it("will throw if bound by array", () => {
    class Foo extends Type {}

    expect(() => Remote.new([Foo], vi.fn())).toThrow("Remote binds classes by key - pass an object of them.");
  })

  it("will throw if two classes share a table", () => {
    class User extends Type {}

    class Admin extends User {
      static table = "user";
      static subset = { role: "admin" };
    }

    expect(() => Remote.new({ User, Admin }, vi.fn())).toThrow("User and Admin share table user - a Remote can't tell them apart.");

    Memory.new({ User, Admin });
  })

  it("will throw if a class is not bound by key", async () => {
    class Foo extends Type {}

    const db = Remote.new({}, vi.fn());

    Foo.connection = db;
    (db.using as Set<unknown>).add(Foo);

    await expect(Foo.query()).rejects.toThrow("Type Foo is not bound by key, so it cannot be sent.");
  })

  it("will throw if a table is not used", async () => {
    const db = Remote.new({}, vi.fn());

    await expect(db.remove("foo", 1)).rejects.toThrow("Table foo is not used by this connection.");
  })

  it("will throw on an unknown column", async () => {
    class Foo extends Type {}

    const db = Remote.new({ Foo }, vi.fn());

    await expect(db.select("foo", [["bar", "=", 1]])).rejects.toThrow("Foo has no column bar.");
    await expect(db.update("foo", 1, { bar: 1 })).rejects.toThrow("Foo has no column bar.");
  })
})

describe("handle", () => {
  it("will reject an unknown class", async () => {
    const serve = Remote.handle(Memory.new());

    await expect(serve({ op: "remove", type: "Foo", id: 1 })).rejects.toThrow("Type Foo is not served by this connection.");
  })

  it("will not serve a class rebound elsewhere", async () => {
    class Foo extends Type {}

    const first = Memory.new({ Foo });
    const serve = Remote.handle(first);

    await first.close();
    Memory.new({ Foo });

    await expect(serve({ op: "remove", type: "Foo", id: 1 })).rejects.toThrow("Type Foo is not served by this connection.");
  })

  it("will reject an unknown property", async () => {
    const { serve } = pair();

    await expect(serve({ op: "update", type: "Author", id: 1, data: { password: "x" } })).rejects.toThrow("Author has no property password.");
    await expect(serve({ op: "select", type: "Author", where: [["password", "=", "x"]] })).rejects.toThrow("Author has no property password.");
    await expect(serve({ op: "insert", type: "Author", data: { name: "x" }, conflict: { on: ["password"] } })).rejects.toThrow("Author has no property password.");
  })

  it("will reject a malformed request", async () => {
    const { serve } = pair();
    const malformed = [
      null,
      [],
      { op: "select" },
      { op: "drop", type: "Author" },
      { op: "select", type: "Author", where: {} },
      { op: "select", type: "Author", where: ["name"] },
      { op: "select", type: "Author", where: [[1, "="]] },
      { op: "select", type: "Author", where: [["name", "= 'x' OR 1=1 OR 'a' =", "x"]] },
      { op: "select", type: "Author", where: [["name", "IN", "x"]] },
      { op: "select", type: "Author", where: [["name", "=", ["x"]]] },
      { op: "select", type: "Author", where: [], limit: "1 OFFSET 1" },
      { op: "select", type: "Author", where: [], limit: 1.5 },
      { op: "select", type: "Author", where: [], offset: -1 },
      { op: "insert", type: "Author", data: [] },
      { op: "insert", type: "Author", data: {}, returns: "yes" },
      { op: "insert", type: "Author", data: {}, conflict: [] },
      { op: "insert", type: "Author", data: {}, conflict: { on: [1] } },
      { op: "insert", type: "Author", data: {}, conflict: { on: ["id"], update: "name" } },
      { op: "update", type: "Author", id: 1 }
    ];

    for (const request of malformed)
      await expect(serve(request), JSON.stringify(request)).rejects.toThrow("Malformed request.");
  })

  it("will reject a malformed id", async () => {
    class Tag extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
    }

    const { serve } = pair();
    const tags = Remote.handle(Memory.new({ Tag }));

    await expect(serve({ op: "remove", type: "Author", id: { id: 1 } })).rejects.toThrow('Author needs an id, not {"id":1}.');
    await expect(tags({ op: "remove", type: "Tag", id: 1 })).rejects.toThrow("Tag needs an id of post,name.");
    await expect(tags({ op: "remove", type: "Tag", id: { post: 1 } })).rejects.toThrow("Tag needs an id of post,name.");
    await expect(tags({ op: "remove", type: "Tag", id: { post: 1, title: "a" } })).rejects.toThrow("Tag needs an id of post,name.");
  })

  it("will check values on the server", async () => {
    const { serve } = pair();

    await expect(serve({ op: "insert", type: "Author", data: { name: 5 } })).rejects.toThrow("Value must be a string.");
  })

  it("will share only exposed properties", async () => {
    const { server, serve, Author } = pair({ expose: { Author: ["name"] } });

    await server.insert("people", { full_name: "Ann", hash: "secret" });

    await expect(serve({ op: "select", type: "Author", where: [] })).resolves.toEqual([{ id: 1, name: "Ann" }]);
    await expect(serve({ op: "select", type: "Author", where: [["hash", "LIKE", "s%"]] })).rejects.toThrow("Author has no property hash.");
    await expect(serve({ op: "update", type: "Author", id: 1, data: { hash: "x" } })).rejects.toThrow("Author has no property hash.");
    await expect(Author.get(1)).resolves.toMatchObject({ name: "Ann" });

    await expect(serve({ op: "insert", type: "Author", data: { name: "Ben" }, returns: true })).resolves.toEqual({ id: 2, name: "Ben" });
  })

  it("will check each request with its context", async () => {
    const check = vi.fn((request: Remote.Request, context: unknown) => {
      if (request.op == "remove")
        throw new Error(`${context} may not delete.`);

      if (request.op == "select")
        request.where.push(["views", ">", 5]);
    });

    const { server, Post } = pair({ check });

    await server.insert("articles", { author_id: 1, title: "a", views: 1 });
    await server.insert("articles", { author_id: 1, title: "b", views: 10 });

    await expect(Post.query()).resolves.toMatchObject([{ title: "b" }]);
    await expect(Post.delete(1)).rejects.toThrow("me may not delete.");
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ op: "remove", id: 1 }), "me");
  })

  it("will not let a request write a fixed field", async () => {
    class Note extends Type {
      text = str();
      by = str({ fixed: true } as any);
    }

    const serve = Remote.handle(Memory.new({ Note }));

    await serve({ op: "insert", type: "Note", data: { text: "a", by: "ann" } });

    await expect(serve({ op: "update", type: "Note", id: 1, data: { by: "eve" } })).rejects.toThrow("by is fixed and can't be updated.");
  })

  it("will leave an existing row when asked to update nothing", async () => {
    const { server, serve } = pair();

    await server.insert("people", { full_name: "Ann" });

    await expect(serve({ op: "insert", type: "Author", data: { id: 1, name: "Ben" }, conflict: { on: ["id"] } })).resolves.toBeUndefined();
    await expect(server.select("people", [])).resolves.toEqual([{ id: 1, full_name: "Ann" }]);
  })

  it("will keep a fixed field on upsert", async () => {
    class Note extends Type {
      text = str();
      by = str({ fixed: true } as any);
    }

    const server = Memory.new({ Note });
    const serve = Remote.handle(server);

    await serve({ op: "insert", type: "Note", data: { text: "a", by: "ann" } });
    await serve({ op: "insert", type: "Note", data: { id: 1, text: "b", by: "eve" }, conflict: { on: ["id"], update: ["id", "text", "by"] } });

    await expect(server.select("note", [])).resolves.toEqual([{ id: 1, text: "b", by: "ann" }]);
  })

  it("will set update fields on the server", async () => {
    class Note extends Type {
      text = str();
      at = date.updated();
    }

    const server = Memory.new({ Note });
    const serve = Remote.handle(server);
    const past = new Date(0);

    await serve({ op: "insert", type: "Note", data: { text: "a", at: past } });
    await serve({ op: "update", type: "Note", id: 1, data: { text: "b", at: past } });

    const [updated] = await server.select("note", []);

    expect(updated.at > past).toBe(true);

    await serve({ op: "insert", type: "Note", data: { id: 1, text: "c" }, conflict: { on: ["id"], update: ["text", "at"] } });

    const [upserted] = await server.select("note", []);

    expect(upserted.text).toBe("c");
    expect(upserted.at > past).toBe(true);
  })

  it("will scope a subset", async () => {
    class Admin extends Type {
      static table = "user";
      static subset = { role: "admin" };
      name = str();
      role = str();
    }

    const server = Memory.new({ Admin });
    const serve = Remote.handle(server);

    await server.insert("user", { name: "Ann", role: "user" });
    await serve({ op: "insert", type: "Admin", data: { name: "Ben", role: "user" } });

    await expect(serve({ op: "select", type: "Admin", where: [] })).resolves.toEqual([{ id: 2, name: "Ben", role: "admin" }]);
  })

  it("will refuse an object for a relation", async () => {
    const { server, serve } = pair({ expose: { Author: ["name"], Post: ["author", "title", "views"] } });

    await expect(serve({ op: "insert", type: "Post", data: { title: "x", author: { name: "M", hash: "planted" } } })).rejects.toThrow('Post.author can\'t take {"name":"M","hash":"planted"}.');
    await expect(serve({ op: "update", type: "Post", id: 1, data: { author: { name: "M" } } })).rejects.toThrow("Post.author can't take");
    await expect(serve({ op: "select", type: "Post", where: [["author", "=", { hash: "s" }]] })).rejects.toThrow("Post.author can't take");
    await expect(serve({ op: "select", type: "Post", where: [["author", "IN", [1, { hash: "s" }]]] })).rejects.toThrow("Post.author can't take");
    await expect(serve({ op: "select", type: "Post", where: [["title", "=", { a: 1 }]] })).rejects.toThrow('Post.title can\'t take {"a":1}.');
    await expect(server.select("people", [])).resolves.toEqual([]);
  })

  it("will check each value in a list", async () => {
    const { server, serve } = pair();

    await server.insert("articles", { author_id: 1, title: "a", views: 1 });

    await expect(serve({ op: "select", type: "Post", where: [["views", "IN", [1, 2]], ["title", "LIKE", "a%"]] })).resolves.toMatchObject([{ title: "a" }]);
    await expect(serve({ op: "select", type: "Post", where: [["views", "IN", [1, "x"]]] })).rejects.toThrow("value must be a number");
  })

  it("will refuse oversized requests", async () => {
    const { serve } = pair();
    const many = Array.from({ length: 101 }, () => ["views", ">", 0]);

    await expect(serve({ op: "select", type: "Post", where: many })).rejects.toThrow("Malformed request.");
    await expect(serve({ op: "select", type: "Post", where: [["views", "IN", Array.from({ length: 1001 }, (_, i) => i)]] })).rejects.toThrow("Malformed request.");
  })

  it("will refuse a value missing or of the wrong kind", async () => {
    const { serve } = pair();

    await expect(serve({ op: "select", type: "Post", where: [["title", "="]] })).rejects.toThrow("Malformed request.");
    await expect(serve({ op: "select", type: "Post", where: [["title", "LIKE", 5]] })).rejects.toThrow("Malformed request.");
    await expect(serve({ op: "update", type: "Post", data: {} })).rejects.toThrow("Malformed request.");
    await expect(serve({ op: "remove", type: "Post" })).rejects.toThrow("Malformed request.");
    await expect(serve({ op: "insert", type: "Post", data: {}, conflict: { on: [] } })).rejects.toThrow("Malformed request.");
  })

  it("will refuse an update to a key", async () => {
    const { serve } = pair();

    await expect(serve({ op: "update", type: "Post", id: 1, data: { id: 99 } })).rejects.toThrow("Post.id is part of its key and can't be updated.");
  })

  it("will send a composite key with a relation part", async () => {
    const build = () => {
      class User extends Type {
        name = str();
      }

      class Member extends Type {
        id = key(() => [this.user, this.role]);
        user = one(User);
        role = str();
        note = str(null);
      }

      return { User, Member };
    };

    const server = build();
    const client = build();
    const host = Memory.new(server);

    Remote.new(client, Remote.handle(host));

    const ann = await client.User.insert({ name: "Ann" });

    await client.Member.insert({ user: ann.id, role: "owner" });

    const member = (await client.Member.get([ann.id, "owner"] as any))!;

    await expect(client.Member.query(undefined, 1)).resolves.toHaveLength(1);
    await member.set({ note: "n" });
    await expect(server.Member.query()).resolves.toMatchObject([{ note: "n" }]);

    await member.delete();
    await expect(server.Member.query()).resolves.toEqual([]);
  })

  it("will scope writes by id to a subset", async () => {
    class Person extends Type {
      static table = "user";
      static subset = { role: "user" };
      name = str();
      role = str();
    }

    const server = Memory.new({ Person });
    const serve = Remote.handle(server);

    await server.insert("user", { name: "Root", role: "admin" });
    await server.insert("user", { name: "Ann", role: "user" });

    await serve({ op: "update", type: "Person", id: 1, data: { name: "pwned" } });
    await serve({ op: "remove", type: "Person", id: 1 });
    await expect(serve({ op: "update", type: "Person", id: 2, data: { role: "admin" } })).rejects.toThrow("Person.role is fixed by its subset.");
    await serve({ op: "update", type: "Person", id: 2, data: { name: "Anne" } });

    await expect(server.select("user", [])).resolves.toEqual([
      { id: 1, name: "Root", role: "admin" },
      { id: 2, name: "Anne", role: "user" }
    ]);
  })

  it("will stamp inserts and upserts on the server", async () => {
    class Note extends Type {
      email = str();
      text = str();
      made = date.created();
      at = date.updated();
    }

    const server = Memory.new({ Note });
    const serve = Remote.handle(server);
    const past = new Date(0);
    const future = new Date(4102444800000);

    await serve({ op: "insert", type: "Note", data: { email: "a", text: "a", made: past, at: future } });

    const [inserted] = await server.select("note", []);

    expect(inserted.made > past && inserted.made < future).toBe(true);
    expect(inserted.at < future).toBe(true);

    await server.update("note", 1, { at: past });
    await serve({ op: "insert", type: "Note", data: { email: "a", text: "b" }, conflict: { on: ["email"], update: ["text"] } });

    const [upserted] = await server.select("note", []);

    expect(upserted.text).toBe("b");
    expect(upserted.at > past).toBe(true);
  })

  it("will hide a failure past validation", async () => {
    const { server, serve } = pair();

    server.before(server.using.values().next().value as typeof Type, {
      delete(){
        throw new Error("table people is locked");
      }
    });

    await server.insert("people", { full_name: "Ann" });

    const error = await serve({ op: "remove", type: "Author", id: 1 }).catch(e => e) as Error & { cause: Error };

    expect(error.message).toBe("Request failed.");
    expect(error.cause.message).toBe("table people is locked");
  })

  it("will serve only classes named in expose", async () => {
    const { serve } = pair({ expose: { Author: ["name"] } });

    await expect(serve({ op: "select", type: "Post", where: [] })).rejects.toThrow("Type Post is not served by this connection.");
    expect(() => Remote.handle(Memory.new(), { expose: { User: [] } })).toThrow("Type User in expose is not served by this connection.");
  })

  it("will share key parts under expose", async () => {
    class Tag extends Type {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
      note = str(null);
    }

    const server = Memory.new({ Tag });
    const check = vi.fn();
    const serve = Remote.handle(server, { expose: { Tag: ["note"] }, check });

    await server.insert("tag", { post: 1, name: "a", note: "n" });

    await expect(serve({ op: "select", type: "Tag", where: [["post", "=", 1]] })).resolves.toEqual([{ post: 1, name: "a", note: "n" }]);
    await serve({ op: "remove", type: "Tag", id: { name: "a", post: 1 } });

    expect(check).toHaveBeenLastCalledWith(expect.objectContaining({ id: { name: "a", post: 1 } }), undefined);
  })

  it("will refuse an upsert taking over a row outside its subset", async () => {
    class Pub extends Type {
      static table = "doc";
      static subset = { status: "pub" };
      title = str();
      status = str();
    }

    const server = Memory.new({ Pub });
    const serve = Remote.handle(server);

    await server.insert("doc", { title: "secret", status: "draft" });
    await server.insert("doc", { title: "open", status: "pub" });

    const takeover = { op: "insert", type: "Pub", data: { id: 1, title: "hacked" }, returns: true, conflict: { on: ["id"], update: ["title", "status"] } };
    const error = await serve(takeover).catch(e => e) as Error & { cause: Error };

    expect(error.cause.message).toBe("Pub can't take a row outside its subset.");

    await serve({ op: "insert", type: "Pub", data: { id: 2, title: "edited" }, conflict: { on: ["id"], update: ["title", "status"] } });
    await serve({ op: "insert", type: "Pub", data: { id: 3, title: "new" }, conflict: { on: ["id"], update: ["title"] } });

    await expect(server.select("doc", [])).resolves.toEqual([
      { id: 1, title: "secret", status: "draft" },
      { id: 2, title: "edited", status: "pub" },
      { id: 3, title: "new", status: "pub" }
    ]);
  })

  it("will let a client fill fields it can't see", async () => {
    const build = () => {
      class User extends Type {
        name = str();
        role = str({ fallback: "user" });
        made = date.created();
        at = date.updated();
      }

      return { User };
    };

    const server = build();
    const client = build();
    const host = Memory.new(server);

    Remote.new(client, Remote.handle(host, { expose: { User: ["name"] } }));

    await client.User.insert({ name: "Ann" });
    await client.User.insert({ id: 1, name: "Anne" }, { conflict: "replace" });
    await client.User.update(1, { name: "Ann" });

    const ann = await client.User.get(1);

    await ann.set({ name: "A" });
    await expect(client.User.query(undefined, 5)).resolves.toMatchObject([{ id: 1, name: "A" }]);
    await expect(server.User.query()).resolves.toMatchObject([{ name: "A", role: "user" }]);

    const serve = Remote.handle(host, { expose: { User: ["name"] } });

    await expect(serve({ op: "update", type: "User", id: 1, data: { name: "x", role: "admin" } })).resolves.toBeUndefined();
    await expect(server.User.query()).resolves.toMatchObject([{ name: "x", role: "user" }]);
    await expect(serve({ op: "select", type: "User", where: [["role", "=", "user"]] })).rejects.toThrow("User has no property role.");
    await expect(serve({ op: "select", type: "User", where: [["role", "asc"]] })).rejects.toThrow("User has no property role.");
  })

  it("will keep a client's value unless the server owns the clock", async () => {
    let n = 0;

    class Task extends Type {
      by = str({ update: "sys" });
      kind = str({ fixed: true, fallback: "note" } as any);
      seen = num({ update: () => ++n } as any);
    }

    const server = Memory.new({ Task });
    const serve = Remote.handle(server);

    await serve({ op: "insert", type: "Task", data: { by: "me", kind: "task", seen: 0 } });
    await expect(server.select("task", [])).resolves.toMatchObject([{ by: "me", kind: "task" }]);

    n = 0;
    await serve({ op: "update", type: "Task", id: 1, data: { by: "you" } });

    expect(n).toBe(1);
    await expect(server.select("task", [])).resolves.toMatchObject([{ by: "sys", seen: 1 }]);
  })

  it("will check each part of a composite id", async () => {
    class User extends Type {
      secret = str();
    }

    class Member extends Type {
      static subset = { live: true };
      id = key(() => [this.user, this.slug]);
      user = one(User);
      slug = str();
      live = bool();
    }

    const serve = Remote.handle(Memory.new({ User, Member }));

    await expect(serve({ op: "remove", type: "Member", id: { user: { secret: "s" }, slug: "a" } })).rejects.toThrow("Member.user can't take {\"secret\":\"s\"}.");
    await expect(serve({ op: "remove", type: "Member", id: { user: [1], slug: "a" } })).rejects.toThrow("Member.user can't take [1].");
  })

  it("will refuse a constraint check adds on an unknown property", async () => {
    const { serve } = pair({
      check(request){
        if (request.op == "select")
          request.where.push(["owner", "IS NULL"]);
      }
    });

    await expect(serve({ op: "select", type: "Post", where: [] })).rejects.toThrow("Post has no property owner.");
  })

  it("will describe a value it can't serialize", async () => {
    const { serve } = pair();

    await expect(serve({ op: "insert", type: "Author", data: { name: 10n } })).rejects.toThrow("Author.name can't take 10.");
  })
})
