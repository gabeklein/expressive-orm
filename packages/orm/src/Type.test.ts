import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { get, Model } from '@expressive/mvc';

import { Connection } from './Connection';
import { Field } from './Field';
import { memory } from './memory';
import { Query } from './query/Query';
import { Type } from './Type';
import { asc, desc, equal, greaterThan, isIn, isLike, isNull, lessThan, notEqual, notNull, Where } from './where';
import { bool, date, json, key, lazy, now, num, one, optional, orNull, str, uuid } from '.';

function spy<K extends "select" | "insert" | "update" | "remove">(connection: Connection, key: K) {
  void connection[key];
  return vi.spyOn(connection, key);
}

class Live extends Connection {
  _db = memory();
  _emit?: (change: Connection.Change) => void;
  _subscribed = 0;

  select(...args: Parameters<Connection["select"]>){
    return this._db.select(...args);
  }

  insert(...args: Parameters<Connection["insert"]>){
    return this._db.insert(...args);
  }

  update(...args: Parameters<Connection["update"]>){
    return this._db.update(...args);
  }

  remove(...args: Parameters<Connection["remove"]>){
    return this._db.remove(...args);
  }

  subscribe(listener: (change: Connection.Change) => void){
    this._emit = listener;
    this._subscribed++;

    return () => {
      this._emit = undefined;
    };
  }
}

const settled = () => new Promise(res => setTimeout(res));

function connect(){
  return class Table extends Type {
    static connection = memory();
  }
}

it("will be a Model", async () => {
  class User extends connect() {
    name = str();
  }

  const user = await User.new({ name: "John" });

  expect(user).toBeInstanceOf(Model);
  expect(user.get()).toEqual({ id: 1, name: "John" });

  const didUpdate = vi.fn();

  user.set(didUpdate);
  await user.set({ name: "Jane" });

  expect(user.name).toBe("Jane");
  expect(didUpdate).toHaveBeenCalledWith("name", user);
});

it("will throw on assignment", async () => {
  class User extends connect() {
    name = str();
  }

  const user = await User.new({ name: "John" });

  expect(() => user.name = "Jane").toThrow("User.name is read-only; use set().");
  expect(() => user.id = 2).toThrow("User.id is read-only; use set().");
  expect(user.name).toBe("John");
});

it("will allow for methods", async () => {
  const didGreet = vi.fn();

  class User extends connect() {
    name = str();

    greet() {
      didGreet(`Hello, ${this.name}`);
    }
  }

  const user = await User.new({ name: "John" });

  expect(user.id).toBe(1);
  expect(user.name).toBe("John");

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John");

  await user.set({ name: "John Doe" });

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John Doe");
})

it("will throw if no connection", async () => {
  class User extends Type {
    name = str();
  }

  await expect(User.find()).rejects.toThrow("No database connection.");
})

describe("fields", () => {
  it("will collect fields without an instance", () => {
    class User extends connect() {
      name = str();
      fullName = str({ column: "full" });
    }

    const { fields } = User;

    expect([...fields.keys()]).toEqual(["id", "name", "fullName"]);
    expect(fields.get("name")).toBeInstanceOf(Field);
    expect(fields.get("fullName")!.column).toBe("full");
    expect(User.fields).toBe(fields);
  })

  it("will use fields of first instance", async () => {
    class User extends connect() {
      name = str();
    }

    await User.new({ name: "A" });

    expect([...User.fields.keys()]).toEqual(["id", "name"]);
  })

  it("will not insert to collect fields", async () => {
    class User extends connect() {
      name = str();
    }

    const insert = spy(User.connection, "insert");

    expect([...User.fields.keys()]).toEqual(["id", "name"]);
    await settled();
    expect(insert).not.toHaveBeenCalled();
    expect(User.loaded.size).toBe(0);
  })

  it("will apply nullable and optional", () => {
    class User extends connect() {
      a = str(orNull);
      b = str(optional);
      c = str(null, undefined, false);
    }

    const { a, b, c } = Object.fromEntries(User.fields);

    expect(a.nullable).toBe(true);
    expect(b.optional).toBe(true);
    expect(c.nullable).toBe(true);
  })

  it("will carry column metadata", () => {
    class User extends connect() {
      name = str({ type: "varchar", length: 3, unique: true });
    }

    class Post extends connect() {
      user = one(User);
    }

    const name = User.fields.get("name")!;

    expect(name.datatype).toBe("varchar(3)");
    expect(name.length).toBe(3);
    expect(name.unique).toBe(true);
    expect(name.kind).toBe(String);
    expect(name.parent).toBe(User);
    expect(Post.fields.get("user")!.reference).toBe(User.fields.get("id"));
  })
})

describe("columns", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
    age = num(orNull);
  }

  class Post extends Table {
    static table = "post";
    title = str();
    when = date(orNull);
    user = one(User);
    editor = one(User, orNull, lazy, { column: "editor_id" });
  }

  const ready = (async () => {
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("user", { name: "Bob" });
    await Table.connection.insert("post", { title: "Hello", user_id: 1, editor_id: 2 });
  })();

  it("will output columns", async () => {
    const user = await User.new({ name: "John" });

    expect(user.columns).toEqual({ id: user.id, name: "John", age: undefined });
    expect(Object.isFrozen(user.columns)).toBe(true);
    expect(user.get()).not.toHaveProperty("columns");
  })

  it("will throw on assignment", async () => {
    const user = await User.new({ name: "John" });

    expect(() => user.columns = {}).toThrow(`${user}.columns is read-only.`);
  })

  it("will read eager relation as id", async () => {
    await ready;
    const post = await Post.get(1);

    expect(post.user).toBeInstanceOf(User);
    expect(post.columns.user).toBe(1);
  })

  it("will read lazy relation as id without loading", async () => {
    await ready;
    User.loaded.delete(2);
    Post.loaded.delete(1);

    const post = await Post.get(1);
    const select = spy(Table.connection, "select");

    expect(post.columns).toEqual({ id: post.id, title: "Hello", when: undefined, user: 1, editor: 2 });
    expect(select).not.toHaveBeenCalled();

    const pending = (() => { try { return post.editor } catch (e) { return e } })();

    expect(pending).toBeInstanceOf(Promise);
    expect(post.columns.editor).toBe(2);

    await pending;

    expect(select).toHaveBeenCalledTimes(1);
    expect(post.columns.editor).toBe(2);

    select.mockRestore();
  })

  it("will read relation created by instance", async () => {
    await ready;
    const user = await User.get(1);
    const post = await Post.new({ title: "Draft", user });

    expect(post.columns).toEqual({ id: post.id, title: "Draft", when: undefined, user: 1, editor: undefined });
  })

  it("will update effect on column and relation", async () => {
    await ready;
    const gabe = await User.get(1);
    const bob = await User.get(2);
    const post = await Post.new({ title: "Draft", user: gabe });
    const effect = vi.fn();

    post.get($ => void effect($.columns));

    expect(effect).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Draft", user: 1 }));

    await post.set({ title: "Final" });
    await expect.poll(() => effect.mock.calls.length).toBe(2);
    expect(effect).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Final", user: 1 }));

    await post.set({ user: bob });
    await expect.poll(() => effect.mock.calls.length).toBe(3);
    expect(effect).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Final", user: 2 }));
  })

  it("will update effect on settled live update", async () => {
    await ready;
    const post = await Post.get(1);
    const effect = vi.fn();

    post.get($ => void effect($.columns.title));

    await Table.connection.update("post", post.id, { title: "Changed" });

    await expect.poll(() => effect.mock.calls.length).toBe(2);
    expect(effect).toHaveBeenLastCalledWith("Changed");

    await Table.connection.update("post", post.id, { title: "Hello" });
  })

  it("will insert from columns", async () => {
    await ready;
    const post = await Post.get(1);
    const { id, ...row } = post.columns;
    const copy = await Post.insert(row);

    expect(copy).toEqual({ ...post.columns, id: copy.id });
  })

  it("will serialize as JSON", async () => {
    await ready;
    const when = new Date("2024-01-01T00:00:00.000Z");
    const user = await User.get(1);
    const post = await Post.new({ title: "Draft", when, user });

    expect(JSON.parse(JSON.stringify(post.columns))).toEqual({
      id: post.id, title: "Draft", when: when.toISOString(), user: 1
    });
  })
})

describe("codecs", () => {
  class Thing extends connect() {
    flag = bool();
    when = date(orNull);
    data = json<{ a: number }>(orNull);
    count = num(orNull);
  }

  it("will round-trip values", async () => {
    const when = new Date("2024-01-01T00:00:00.000Z");
    const thing = await Thing.insert({ flag: true, when, data: { a: 1 }, count: 3 });

    expect(thing.flag).toBe(true);
    expect(thing.when).toEqual(when);
    expect(thing.data).toEqual({ a: 1 });
    expect(thing.count).toBe(3);
  })

  it("will round-trip empty values", async () => {
    const thing = await Thing.insert({ flag: false, when: undefined, data: undefined, count: undefined });

    expect(thing.flag).toBe(false);
    expect(thing.when).toBeUndefined();
    expect(thing.data).toBeUndefined();
    expect(thing.count).toBeUndefined();
  })

  it("will store null for falsy date", async () => {
    const thing = await Thing.insert({ flag: true, when: null });

    expect(thing.when).toBeUndefined();
  })

  it("will parse missing boolean as undefined", async () => {
    await Thing.connection.insert(Thing.ref, { data: null });

    const thing = await Thing.one();

    expect(thing.flag).toBeUndefined();
  })
})

describe("rows", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    when = date(orNull);
    data = json<{ a: number }>(orNull);
    user = one(User);
    editor = one(User, orNull, { column: "editor_id" });
  }

  it("will read frozen plain rows", async () => {
    const user = await User.insert({ name: "Gabe" });
    const when = new Date(0);
    const post = await Post.insert({ title: "Hello", when, data: { a: 1 }, user });
    const reads = [post, await Post.one(post.id), ...await Post.find()];

    expect(post).toEqual({ id: 1, title: "Hello", when, data: { a: 1 }, user: 1, editor: undefined });

    for (const row of reads) {
      expect(row).toEqual(post);
      expect(row).not.toBeInstanceOf(Type);
      expect(Object.isFrozen(row)).toBe(true);
    }

    expect(JSON.parse(JSON.stringify(post))).toEqual({
      id: 1, title: "Hello", when: when.toISOString(), data: { a: 1 }, user: 1
    });
    expect(User.loaded.size).toBe(0);
    expect(Post.loaded.size).toBe(0);
  })
})

describe("insert", () => {
  it("will return the stored row", async () => {
    const db = memory();
    const { insert } = db;

    class Post extends Type {
      static connection = Object.assign(db, {
        insert: (table: string, row: Record<string, any>) => insert(table, { status: "draft", ...row }, true)
      });

      title = str();
      status = str(optional);
    }

    const post = await Post.insert({ title: "Hello" });

    expect(post).toEqual({ id: 1, title: "Hello", status: "draft" });
    expect(Object.isFrozen(post)).toBe(true);
    expect(Post.loaded.size).toBe(0);
  })

  it("will throw on missing required field", async () => {
    class User extends connect() {
      name = str();
    }

    // @ts-expect-error
    await expect(User.insert({})).rejects.toThrow("Missing required field: name");
  })

  it("will apply subset", async () => {
    class User extends connect() {
      static subset = { role: "admin" };
      name = str();
      role = str();
    }

    const user = await User.insert({ name: "John" } as any);

    expect(user.role).toBe("admin");
  })

  it("will use schema in ref", async () => {
    class User extends connect() {
      static schema = "app";
      static table = "user";
      name = str();
    }

    await User.insert({ name: "John" });

    expect(User.ref).toBe("app.user");
    await expect(User.connection.select("app.user", [])).resolves.toEqual([{ id: 1, name: "John" }]);
  })

  it("will derive table from each class name", () => {
    class BlogPost extends connect() {}
    class Comment extends connect() {}

    expect(BlogPost.table).toBe("blog_post");
    expect(Comment.table).toBe("comment");
    expect(BlogPost.ref).toBe("blog_post");
  })

  it("will not inherit a parent's ref", () => {
    class Person extends connect() {
      static table = "person";
    }

    expect(Person.ref).toBe("person");

    class Author extends Person {
      static table = "author";
    }

    expect(Author.ref).toBe("author");
  })
})

describe("update", () => {
  class User extends connect() {
    name = str();
    age = num(orNull);
  }

  it("will update by id", async () => {
    const { id } = await User.insert({ name: "John" });

    await expect(User.update(id, { name: "Bob" })).resolves.toBeUndefined();
    await expect(User.one(id)).resolves.toEqual({ id, name: "Bob", age: undefined });
  })

  it("will settle a loaded entity by id", async () => {
    const user = await User.new({ name: "John" });
    const select = spy(User.connection, "select");

    await User.update(user.id, { name: "Bob", age: 30 });

    expect(user.name).toBe("Bob");
    expect(user.age).toBe(30);
    expect(select).not.toHaveBeenCalled();

    select.mockRestore();
  })
})

describe("set", () => {
  class User extends connect() {
    name = str();
    age = num(orNull);
  }

  it("will update record", async () => {
    const user = await User.new({ name: "John" });

    await user.set({ age: 30 });

    expect(user.age).toBe(30);
    expect(user.name).toBe("John");

    const [row] = await User.connection.select(User.ref, [["id", "=", user.id]]);

    expect(row).toEqual({ id: user.id, name: "John", age: 30 });
  })

  it("will write once", async () => {
    const update = spy(User.connection, "update");
    const user = await User.new({ name: "John" });

    await user.set({ name: "Bob", age: 20 });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(User.ref, user.id, { name: "Bob", age: 20 });

    update.mockRestore();
  })

  it("will not write an empty patch", async () => {
    const user = await User.new({ name: "John" });
    const update = spy(User.connection, "update");

    await expect(user.set({})).resolves.toEqual([]);
    expect(update).not.toHaveBeenCalled();

    update.mockRestore();
  })

  it("will settle after write", async () => {
    const user = await User.new({ name: "John" });
    const update = spy(User.connection, "update");
    let write!: () => void;
    const didUpdate = vi.fn();

    update.mockImplementationOnce(() => new Promise<void>(res => write = res));
    user.set(didUpdate);

    const pending = user.set({ name: "Bob", age: 30 });

    expect([...pending]).toEqual([]);
    await settled();

    expect(user.name).toBe("John");
    expect(didUpdate).not.toHaveBeenCalled();

    write();

    await expect(pending).resolves.toEqual(["name", "age"]);
    expect(user.name).toBe("Bob");
    expect(didUpdate).toHaveBeenCalledTimes(2);

    update.mockRestore();
  })

  it("will notify an effect once", async () => {
    const user = await User.new({ name: "John" });
    const effect = vi.fn();

    user.get($ => void effect($.name, $.age));
    await user.set({ name: "Bob", age: 30 });

    expect(effect).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenLastCalledWith("Bob", 30);
  })

  it("will clear nullable column", async () => {
    const user = await User.new({ name: "John", age: 30 });

    await user.set({ age: null });

    const [row] = await User.connection.select(User.ref, [["id", "=", user.id]]);

    expect(row.age).toBeNull();
    expect(user.age).toBeUndefined();
  })

  it("will throw on invalid value", async () => {
    const user = await User.new({ name: "John" });
    const update = spy(User.connection, "update");

    await expect(user.set({ age: "old" as any })).rejects.toThrow("Got 'old' but value must be a number.");
    expect(update).not.toHaveBeenCalled();
    expect(user.age).toBeUndefined();

    update.mockRestore();
  })

  it("will apply prepare", async () => {
    class Account extends connect() {
      name = str();

      protected static async prepare(data: any, partial?: boolean) {
        return super.prepare({ ...data, name: data.name?.toUpperCase() }, partial);
      }
    }

    const account = await Account.new({ name: "john" });

    await account.set({ name: "bob" });

    expect(account.name).toBe("BOB");
  })

  it("will notify observers on read-back", async () => {
    class Event extends connect() {
      when = date();
    }

    const event = await Event.new({ when: new Date(0) });
    const assigned = new Date(1);
    const didUpdate = vi.fn();

    event.set(didUpdate);
    await event.set({ when: assigned });

    expect(didUpdate).toHaveBeenCalledWith("when", event);
    expect(event.when).not.toBe(assigned);
    expect(event.when).toEqual(assigned);
  })

  it("will pass other forms to Model", async () => {
    const user = await User.new({ name: "John" });
    const didSet = vi.fn();
    const release = user.set("name", didSet);

    await expect(user.set("name")).resolves.toEqual(["name"]);
    expect(didSet).toHaveBeenCalledTimes(1);
    expect(release()).toBe(true);
    await expect(user.set()).resolves.toEqual([]);
  })

  it("will set relation by id, row or entity", async () => {
    class Table extends connect() {}

    class Author extends Table {
      static table = "author";
      name = str();
    }

    class Book extends Table {
      static table = "book";
      name = str();
      author = one(Author);
    }

    const gabe = await Author.new({ name: "Gabe" });
    const alice = await Author.new({ name: "Alice" });
    const bob = await Author.insert({ name: "Bob" });
    const book = await Book.new({ name: "Book", author: gabe });
    const update = spy(Book.connection, "update");

    await book.set({ author: alice.id });

    expect(update).toHaveBeenLastCalledWith("book", book.id, { author_id: alice.id });
    expect(book.author).toBe(alice);

    await book.set({ author: bob });

    expect(update).toHaveBeenLastCalledWith("book", book.id, { author_id: bob.id });
    expect(book.author).toBe(Author.loaded.get(bob.id));
    expect(book.author.name).toBe("Bob");

    await book.set({ author: gabe });

    expect(update).toHaveBeenLastCalledWith("book", book.id, { author_id: gabe.id });
    expect(book.author).toBe(gabe);

    update.mockRestore();
  })

  it("will reject on deleted entity", async () => {
    const user = await User.new({ name: "John" });

    await user.delete();

    await expect(user.set({ name: "Bob" })).rejects.toThrow(`User ${user.id} was deleted.`);
  })

  it("will reject before loaded", async () => {
    const user = User.get(999);
    const created = User.new({ name: "Bob" });

    await expect(user.set({ name: "Bob" })).rejects.toThrow("User is not loaded yet.");
    await expect(created.set({ name: "Bob" })).rejects.toThrow("User is not loaded yet.");
    await expect(user).rejects.toThrow();
    await created;
  })
})

describe("new", () => {
  class User extends connect() {
    name = str();
    age = num(orNull);
  }

  it("will insert and resolve entity", async () => {
    const insert = spy(User.connection, "insert");
    const user = await User.new({ name: "John" });

    expect(user).toBeInstanceOf(User);
    expect("then" in user).toBe(false);
    expect(insert).toHaveBeenCalledWith(User.ref, { name: "John" }, true);
    expect(user.columns).toEqual({ id: user.id, name: "John", age: undefined });
    await expect(User.one(user.id)).resolves.toEqual(user.columns);

    insert.mockRestore();
  })

  it("will register in identity map", async () => {
    const user = await User.new({ name: "John" });

    expect(User.loaded.get(user.id)).toBe(user);
    expect(User.get(user.id)).toBe(user);
  })

  it("will suspend columns until inserted", async () => {
    const user = User.new({ name: "John" });
    const pending = (() => { try { return user.name } catch (e) { return e } })();

    expect(pending).toBeInstanceOf(Promise);

    await pending;

    expect(user.name).toBe("John");
  })

  it("will assign defaults from inserted row", async () => {
    const db = memory();
    const { insert } = db;

    class Post extends Type {
      static connection = Object.assign(db, {
        insert: (table: string, row: Record<string, any>) => insert(table, { status: "draft", ...row }, true)
      });

      status = str(optional);
    }

    const post = await Post.new({});

    expect(post.id).toBe(1);
    expect(post.status).toBe("draft");
  })

  it("will apply subset", async () => {
    class Admin extends connect() {
      static subset = { role: "admin" };
      name = str();
      role = str();
    }

    const admin = await Admin.new({ name: "John" } as any);

    expect(admin.role).toBe("admin");
  })

  it("will reject and destroy on failure", async () => {
    const didCatch = vi.fn();
    const release = Model.on({ catch: didCatch });
    // @ts-expect-error
    const user = User.new({});
    const destroyed = vi.fn();
    const pending = (() => { try { return user.name } catch (e) { return e } })();

    user.set(null, destroyed);

    try {
      await expect(user).rejects.toThrow("Missing required field: name");
      await expect(pending).rejects.toThrow("Missing required field: name");
      await settled();
    }
    finally {
      release();
    }

    expect(destroyed).toHaveBeenCalled();
    expect([...User.loaded.values()]).not.toContain(user);
    expect(didCatch).not.toHaveBeenCalled();
  })

  it("will report failure not awaited", async () => {
    const didCatch = vi.fn();
    const release = Model.on({ catch: didCatch });
    // @ts-expect-error
    const user = User.new({});
    const pending = (() => { try { return user.name } catch (e) { return e } })();

    try {
      await expect(pending).rejects.toThrow("Missing required field: name");
    }
    finally {
      release();
    }

    expect(didCatch).toHaveBeenCalledWith(expect.objectContaining({ message: "Missing required field: name" }), "setup", undefined);
  })

  it("will reject on driver error", async () => {
    const failure = new Error("Insert failed");
    const didCatch = vi.fn();
    const release = Model.on({ catch: didCatch });
    const insert = spy(User.connection, "insert").mockRejectedValueOnce(failure);

    try {
      await expect(User.new({ name: "John" })).rejects.toBe(failure);
      await settled();
    }
    finally {
      release();
      insert.mockRestore();
    }

    expect(didCatch).not.toHaveBeenCalled();
  })
})

describe("delete", () => {
  it("will delete record", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "John" });

    await user.delete();

    await expect(User.find()).resolves.toEqual([]);
  })

  it("will evict and destroy entity", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "John" });
    const destroyed = vi.fn();

    user.set(null, destroyed);
    await user.delete();

    expect(destroyed).toHaveBeenCalled();
    expect(User.loaded.has(user.id)).toBe(false);
  })

  it("will throw on write after delete", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "John" });

    await user.delete();

    await expect(user.set({ name: "Bob" })).rejects.toThrow(`User ${user.id} was deleted.`);
    await expect(user.delete()).rejects.toThrow(`User ${user.id} was deleted.`);
    expect(user.name).toBe("John");
  })

  it("will call onDelete", async () => {
    const didDelete = vi.fn();

    class User extends connect() {
      name = str();

      protected async onDelete() {
        didDelete(this.name);
      }
    }

    const user = await User.new({ name: "John" });

    await user.delete();

    expect(didDelete).toHaveBeenCalledWith("John");
  })
})

describe("static delete", () => {
  it("will delete by id", async () => {
    class User extends connect() {
      name = str();
    }

    const { id } = await User.insert({ name: "John" });

    await expect(User.delete(id)).resolves.toBeUndefined();
    await expect(User.find()).resolves.toEqual([]);
  })

  it("will evict and destroy a loaded entity", async () => {
    for (const connection of [memory(), Live.new()]) {
      class User extends Type {
        static connection = connection;
        name = str();
      }

      const user = await User.new({ name: "John" });
      const destroyed = vi.fn();

      user.set(null, destroyed);
      await User.delete(user.id);
      await settled();

      expect(destroyed).toHaveBeenCalledTimes(1);
      expect(User.loaded.has(user.id)).toBe(false);
      await expect(user.set({ name: "Bob" })).rejects.toThrow(`User ${user.id} was deleted.`);
    }
  })
})

describe("one method", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["Gabe", "Alice", "Bob"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will get record by id", async () => {
    await ready;
    const user = await User.one(2);

    expect(user.id).toBe(2);
  });

  it("will get latest record", async () => {
    await ready;
    const user = await User.one();

    expect(user.id).toBe(3);
  });

  it("will get ascending result", async () => {
    await ready;
    const user = await User.one({ id: asc() });

    expect(user.id).toBe(1);
  });

  it("will both match and sort", async () => {
    await ready;
    const user = await User.one({
      id: [asc(), greaterThan(1)],
    });

    expect(user.id).toBe(2);
  });

  it("will search for match", async () => {
    await ready;
    const user = await User.one({ name: "Gabe" });

    expect(user.id).toBe(1);
  });

  it("will throw on no match", async () => {
    await ready;
    const query = User.one({ name: "Foo" });

    await expect(query).rejects.toThrow();
  });

  it("will return undefined if optional", async () => {
    await ready;
    const user = await User.one({ name: "Foo" }, false);

    expect(user).toBeUndefined();
  });
});

describe("find", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["Gabe", "Alice", "Bob"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will find latest first by default", async () => {
    await ready;
    const users = await User.find();

    expect(users.map(x => x.name)).toEqual(["Bob", "Alice", "Gabe"]);
  })

  it("will limit and offset", async () => {
    await ready;
    const users = await User.find({ id: asc() }, 1, 1);

    expect(users.map(x => x.name)).toEqual(["Alice"]);
  })

  it("will match many values", async () => {
    await ready;
    const users = await User.find({ name: isIn(["Gabe", "Bob"]), id: asc() });

    expect(users.map(x => x.id)).toEqual([1, 3]);
  })

  it("will skip undefined conditions", async () => {
    await ready;
    const users = await User.find({ name: [undefined as any, equal(undefined)], id: desc() });

    expect(users).toHaveLength(3);
  })

  it("will default to equality", async () => {
    await ready;
    const users = await User.find({ name: new Where() as any });

    expect(users).toHaveLength(0);
  })

  it("will ignore unknown fields", async () => {
    await ready;
    const users = await User.find({ foo: "bar" } as any);

    expect(users).toHaveLength(3);
  })

  it("will accept constraints", async () => {
    await ready;
    const users = await User["fetch"]([["name", "=", "Alice"], ["foo", "=", 1]]);

    expect(users.map(x => x.id)).toEqual([2]);
  })
})

describe("query", () => {
  class User extends connect() {
    static table = "user";
    name = str();
    age = num();
  }

  const ready = (async () => {
    for (const [name, age] of [["Gabe", 30], ["Alice", 25], ["Bob", 40]] as const)
      await User.insert({ name, age });
  })();

  it("will select entities", async () => {
    await ready;
    const query = User.query();
    const users = await query;

    expect<Query.Selects<Query.From<User>>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      select user"
    `);
    expect(users.map(x => x.name)).toEqual(["Gabe", "Alice", "Bob"]);
    expect(users[0]).toEqual({ id: 1, name: "Gabe", age: 30 });
    expect(users[0]).not.toBeInstanceOf(User);
    expect(Object.isFrozen(users[0])).toBe(true);
    expect(User.loaded.size).toBe(0);
  })

  it("will filter entities", async () => {
    await ready;
    const query = User.query((user, where) => {
      where(user.age).over(28);
      where(user.name).asc();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      where user.age > 28
      order user.name asc
      select user"
    `);
    expect((await query).map(x => x.name)).toEqual(["Bob", "Gabe"]);
  })

  it("will select a projection", async () => {
    await ready;
    const query = User.query((user, where) => {
      where(user.age).under(30);
      return { name: user.name };
    });

    expect<Query.Selects<{ name: string }>>(query);
    await expect(query).resolves.toEqual([{ name: "Alice" }]);
  })

  it("will throw without prepare", async () => {
    class Other extends Type {
      static table = "other";
    }

    await expect(Other.query()).rejects.toThrow("Query needs a connection with prepare() to run.");
  })
})

describe("all", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["A", "B", "C", "D", "E"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will page through results", async () => {
    await ready;
    const pages: string[][] = [];

    for await (const page of User.all(2, { id: asc() }))
      pages.push(page.map(x => x.name));

    expect(pages).toEqual([["A", "B"], ["C", "D"], ["E"]]);
  })

  it("will stop on empty page", async () => {
    await ready;
    const pages: number[] = [];

    for await (const page of User.all(5))
      pages.push(page.length);

    expect(pages).toEqual([5]);
  })

  it("will fetch everything without page size", async () => {
    await ready;
    const pages: number[] = [];

    for await (const page of User.all(0))
      pages.push(page.length);

    expect(pages).toEqual([5]);
  })
})

describe("extended types", () => {
  class User extends connect() {
    static table = "users";

    name = str();
  }

  class UserExt extends User {
    static from(name: string) {
      return this.new({ name });
    }

    displayName() {
      return `User: ${this.name}`;
    }
  }

  it("will create extended type", async () => {
    const user = await UserExt.from("Charlie");

    expect(user).toBeInstanceOf(UserExt);
    expect(user.displayName()).toBe("User: Charlie");
  });

  it("will update using extended type", async () => {
    await User.insert({ name: "Alice" });

    const user = await UserExt.get(2);

    expect(user).toBeInstanceOf(UserExt);
    expect(user.displayName()).toBe("User: Alice");

    await user.set({ name: "Alice Doe" });

    expect(user.displayName()).toBe("User: Alice Doe");
    await expect(UserExt.one(2)).resolves.toEqual({ id: 2, name: "Alice Doe" });
  });
})

describe("types", () => {
  it("will type references and new as awaitable entities", () => {
    class User extends Type {
      name = str();
      age = num(orNull);
    }

    const check = async () => {
      const ref = User.get(1);
      const created = User.new({ name: "A" });

      expectTypeOf(ref).toEqualTypeOf<Type.Async<User>>();
      expectTypeOf(created).toEqualTypeOf<Type.Async<User>>();
      expectTypeOf(await User.get(1)).toEqualTypeOf<User>();
      expectTypeOf(await User.new({ name: "A" })).toEqualTypeOf<User>();
      expectTypeOf(ref).toExtend<User>();
      expectTypeOf(await Promise.all([ref, created])).toEqualTypeOf<[User, User]>();

      ref.get(({ name }) => void name);
      created.get(({ name }) => void name);
      ref.set(key => void key);
      created.set(key => void key);
      ref.set({ name: "B" });
      created.set({ age: null });

      // @ts-expect-error
      ref.set({ name: null });
    };

    expect(check).toBeTypeOf("function");
  })

  class Bar extends Type {}
  class FooBar extends Type {
    a = str();
    b = str(null);
    c = str({ nullable: true });
    d = str({ column: "foobar", nullable: true });

    e = one(Bar);
    f = one(Bar, null);
    g = one(Bar, { nullable: true });
    h = one(Bar, { column: "bar_id", nullable: true });
  }

  it("will be assignable to Type", () => {
    class User extends Type {
      name = str();

      greet(){}
    }

    const create = () => User.new({ name: "A" });
    const user: Type = {} as Awaited<ReturnType<typeof create>>;

    expectTypeOf(create).returns.toMatchTypeOf<Type>();
    expect(user).toEqual({});
  })

  it("will properly apply nullable", () => {
    const foobar = {} as FooBar;

    foobar.b = undefined;
    foobar.c = undefined;
    foobar.d = undefined;
    foobar.f = undefined;
    foobar.g = undefined;
    foobar.h = undefined;

    // @ts-expect-error
    foobar.a = undefined;
    // @ts-expect-error
    foobar.e = undefined;
  })
})

describe("primary key", () => {
  it("will mark id primary and increment", () => {
    class User extends connect() {
      name = str();
    }

    const { primary, increment, column } = User.fields.get("id")!;

    expect({ primary, increment, column }).toEqual({ primary: true, increment: true, column: "id" });
  })

  it("will redeclare id with a column", async () => {
    class User extends connect() {
      id = num({ column: "user_id", primary: true });
      name = str();
    }

    class Post extends connect() {
      static connection = User.connection;
      user = one(User);
    }

    const query = Query(where => where(Post).user.id);

    expectTypeOf<User["id"]>().toMatchTypeOf<number>();
    expect(User.fields.get("id")!.column).toBe("user_id");
    expect(String(query)).toMatchInlineSnapshot(`
      "from post
      join user on user.user_id = post.user_id
      select user.user_id"
    `);
  })

  it("will redeclare id as a string", async () => {
    class Doc extends Type {
      static connection = memory();
      id = uuid({ primary: true });
      title = str();
    }

    const row = await Doc.insert({ id: "x1", title: "Hello" });
    const id: string = row.id;
    const doc = await Doc.get(id);

    expect(id).toBe("x1");
    expect(Doc.fields.get("id")!.kind).toBe(String);
    expect(Doc.loaded.get("x1")).toBe(doc);
    await expect(Doc.one("x1")).resolves.toEqual(row);

    await Doc.update("x1", { title: "Bye" });
    expect(doc.title).toBe("Bye");

    await doc.delete();
    await expect(Doc.one("x1", false)).resolves.toBeUndefined();
  })

  it("will type id by declaration", () => {
    class Doc extends Type {
      id = uuid({ primary: true });
    }

    class User extends Type {}

    const doc = {} as Doc;
    const user = {} as User;
    const key: string | number = user.id;
    const narrow: Doc["id"] = "x1";
    const read: string = narrow;

    // @ts-expect-error
    const a: number = doc.id;
    // @ts-expect-error
    const b: string = user.id;
    // @ts-expect-error
    const c: number = user.id;

    expect([key, read, a, b, c]).toEqual([undefined, "x1", undefined, undefined, undefined]);

    const lookups = [
      // @ts-expect-error
      () => Doc.one(1),
      () => User.one("a1", false)
    ];

    expect(lookups).toHaveLength(2);
  })

  it("will relate to a string id", async () => {
    class Doc extends Type {
      static connection = memory();
      id = uuid({ primary: true });
    }

    class Note extends Type {
      static connection = Doc.connection;
      doc = one(Doc);
    }

    await Doc.insert({ id: "a1" });

    const { id } = await Note.insert({ doc: "a1" });
    const note = await Note.get(id);
    const query = Query(where => void where(Note, { doc: "a1" }));

    expect(note.doc).toBe(Doc.get("a1"));
    expect(String(query)).toMatchInlineSnapshot(`
      "insert note
        doc: "a1""
    `);
  })
})

describe("identity map", () => {
  it("will not populate from static reads", async () => {
    class User extends connect() {
      name = str();
    }

    const row = await User.insert({ name: "A" });

    await User.one(row.id);
    await User.find();

    for await (const _ of User.all(1));

    expect(User.loaded.size).toBe(0);
  });

  it("will return a fresh row for each read", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "C" });
    const first = await User.one(user.id);

    await User.connection.update(User.ref, user.id, { name: "C2" });

    const second = await User.one(user.id);

    expect(first).toEqual({ id: user.id, name: "C" });
    expect(second).toEqual({ id: user.id, name: "C2" });
    expect(second).not.toBe(user);
  });

  it("will keep entities per connection", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "D" });

    User.connection = memory();

    expect(User.loaded.get(user.id)).toBeUndefined();
  });
});

describe("references", () => {
  function setup(){
    class User extends connect() {
      name = str();
    }

    const { connection, ref } = User;

    return {
      User,
      row: (name: string) => connection.insert(ref, { name }, true)
    };
  }

  function suspends(read: () => unknown){
    try {
      read();
    }
    catch (thrown) {
      expect(thrown).toBeInstanceOf(Promise);
      return thrown as Promise<unknown>;
    }

    throw new Error("Expected read to suspend.");
  }

  it("will share a placeholder between gets", async () => {
    const { User, row } = setup();

    await row("A");

    const user = User.get(1);

    expect(User.get(1)).toBe(user);
    expect(User.loaded.get(1)).toBe(user);
    expect(user.id).toBe(1);
  });

  it("will resolve await to the entity", async () => {
    const { User, row } = setup();

    await row("A");

    const reference = User.get(1);
    const user = await reference;

    expectTypeOf(user).toEqualTypeOf<InstanceType<typeof User>>();

    expect(user).toBe(reference);
    expect(user.name).toBe("A");
    expect("then" in user).toBe(false);
  });

  it("will suspend columns until loaded", async () => {
    const { User, row } = setup();

    await row("A");

    const user = User.get(1);
    const pending = suspends(() => user.name);

    await expect(pending).resolves.toBe("A");
    expect(user.name).toBe("A");
  });

  it("will return a loaded entity without then", async () => {
    const { User } = setup();
    const user = await User.new({ name: "A" });

    expect(User.get(user.id)).toBe(user);
    expect("then" in user).toBe(false);
  });

  it("will reject if row is missing", async () => {
    const { User } = setup();
    const user = User.get(3);
    const pending = suspends(() => user.name);

    await expect(user).rejects.toThrow("No User found with id 3");
    await expect(pending).rejects.toThrow("No User found with id 3");
    expect(User.loaded.has(3)).toBe(false);
  });

  it("will report a missing row to catch", async () => {
    const { User } = setup();
    const didCatch = vi.fn((error: unknown) => error);

    User.on({ catch: didCatch });

    await expect(User.get(3)).rejects.toThrow();

    expect(didCatch).toHaveBeenCalledWith(expect.any(Error), "setup", undefined);
  });

  it("will reject and report a failed load", async () => {
    const { User } = setup();
    const failure = new Error("Connection lost");
    const didCatch = vi.fn();
    const release = Model.on({ catch: didCatch });

    spy(User.connection, "select").mockRejectedValueOnce(failure);

    try {
      await expect(User.get(1)).rejects.toBe(failure);
    }
    finally {
      release();
    }

    expect(didCatch).toHaveBeenCalledWith(failure, "setup", undefined);
    expect(User.loaded.has(1)).toBe(false);
  });

  it("will not evict a replacement", async () => {
    const { User } = setup();
    const select = spy(User.connection, "select");
    let respond!: (rows: any[]) => void;

    select.mockImplementationOnce(() => new Promise(resolve => respond = resolve));

    const reference = User.get(1);
    const user = await User.new({ name: "C" });

    respond([]);

    await expect(reference).rejects.toThrow("No User found with id 1");
    expect(User.loaded.get(1)).toBe(user);
  });

  it("will suspend relations until loaded", async () => {
    const { User, row } = setup();

    class Post extends Type {
      static connection = User.connection;

      user = one(User);
    }

    await row("A");
    await Post.connection.insert(Post.ref, { user_id: 1 }, true);

    const post = Post.get(1);
    const pending = suspends(() => post.user);

    await expect(pending).resolves.toBe(User.get(1));
    expect(post.user.name).toBe("A");
  });

  it("will keep context lookup", () => {
    const { User } = setup();

    expect(() => User.get()).toThrow("Could not find User in context.");
    expect(User.get(false)).toBeUndefined();
  });

  it("will resolve through a caller", async () => {
    const { User, row } = setup();
    const names: string[] = [];

    class Page extends Model {
      user = get(User, 1);
    }

    await row("A");

    const page = Page.new();

    page.get(({ user }) => {
      names.push(user.name);
    });

    const user = page.get(User, 1);

    expectTypeOf(user).toEqualTypeOf<InstanceType<typeof User>>();

    expect(user).toBe(User.loaded.get(1));
    expect(page.user).toBe(user);

    await user;

    expect(names).toEqual(["A"]);
  });
});

describe("live rows", () => {

  it("will update a loaded entity", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "Gabe" });
    const didUpdate = vi.fn();

    user.get(current => {
      didUpdate(current.name);
    });

    await User.connection.update(User.ref, user.id, { name: "Bob" });
    await settled();

    expect(user.name).toBe("Bob");
    expect(didUpdate).toHaveBeenLastCalledWith("Bob");
  })

  it("will settle every changed field", async () => {
    class User extends connect() {
      name = str();
      age = num(orNull);
    }

    const user = await User.new({ name: "Gabe" });

    await User.connection.update(User.ref, user.id, { name: "Remote", age: 30 });
    await settled();

    expect(user.name).toBe("Remote");
    expect(user.age).toBe(30);
  })

  it("will not refresh an unchanged date", async () => {
    class Event extends connect() {
      at = date();
    }

    const event = await Event.new({ at: new Date(1000) });
    const { at } = event;

    await Event.connection.update(Event.ref, event.id, { at: new Date(1000).toISOString() });
    await settled();

    expect(event.at).toBe(at);

    await Event.connection.update(Event.ref, event.id, { at: new Date(2000).toISOString() });
    await settled();

    expect(event.at).toEqual(new Date(2000));
  })

  it("will destroy a deleted entity", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "Gabe" });

    await User.connection.remove(User.ref, user.id);
    await settled();

    expect(user.get(null)).toBe(true);
    expect(User.loaded.has(user.id)).toBe(false);
    await expect(user.set({ name: "Bob" })).rejects.toThrow(`User ${user.id} was deleted.`);
  })

  it("will not touch entities on insert", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.new({ name: "Gabe" });

    await User.connection.insert(User.ref, { id: user.id, name: "Copy" });
    await settled();

    expect(user.name).toBe("Gabe");
  })

  it("will ignore rows not loaded", async () => {
    class User extends connect() {
      name = str();
    }

    class Post extends Type {
      static connection = User.connection;
      title = str();
    }

    const user = await User.new({ name: "Gabe" });

    await Post.new({ title: "Hello" });
    await User.connection.update(User.ref, 9, { name: "Nobody" });
    await User.connection.update(Post.ref, user.id, { title: "Bye" });
    await settled();

    expect(user.name).toBe("Gabe");
  })

  it("will reload a change without a row", async () => {
    class User extends Type {
      static connection = Live.new();
      name = str();
    }

    const db = User.connection as Live;
    const user = await User.new({ name: "Gabe" });

    await db._db.update(User.ref, user.id, { name: "Bob" });
    db._emit!({ table: User.ref, op: "update", id: user.id });
    await settled();

    expect(user.name).toBe("Bob");

    await db._db.remove(User.ref, user.id);
    db._emit!({ table: User.ref, op: "update", id: user.id });
    await settled();

    expect(user.name).toBe("Bob");
  })

  it("will subscribe once until destroyed", async () => {
    class User extends Type {
      static connection = Live.new();
      name = str();
    }

    class Post extends Type {
      static connection = User.connection;
      title = str();
    }

    const db = User.connection as Live;

    await User.new({ name: "Gabe" });
    await Post.new({ title: "Hello" });

    expect(db._subscribed).toBe(1);
    expect(db._emit).toBeDefined();

    db.set(null);

    expect(db._emit).toBeUndefined();
    await User.new({ name: "Bob" });
    expect(db._subscribed).toBe(1);
  })

  it("will settle a loaded entity on static update", async () => {
    class User extends Type {
      static connection = Live.new();
      name = str();
    }

    const user = await User.new({ name: "Gabe" });

    await User.update(user.id, { name: "Bob" });
    await User.update(9, { name: "Nobody" });

    expect(user.name).toBe("Bob");
  })
})

describe("renamed key column", () => {
  it("will round trip a numeric key", async () => {
    class User extends connect() {
      id = num({ column: "user_id", primary: true });
      name = str();
    }

    const user = await User.new({ name: "Gabe" });
    const [row] = await User.connection.select(User.ref, []);

    expect(user.id).toBe(1);
    expect(row).toEqual({ user_id: 1, name: "Gabe" });
    await expect(User.one(1)).resolves.toEqual({ id: 1, name: "Gabe" });

    await user.set({ name: "Bob" });
    await expect(User.connection.select(User.ref, [])).resolves.toEqual([{ user_id: 1, name: "Bob" }]);

    await User.update(1, { name: "Ann" });
    expect(user.name).toBe("Ann");

    await user.delete();
    await expect(User.connection.select(User.ref, [])).resolves.toEqual([]);
  })

  it("will round trip a string key", async () => {
    class Doc extends connect() {
      id = uuid({ column: "doc_id", primary: true });
      title = str();
    }

    await expect(Doc.insert({ id: "a1", title: "Hello" })).resolves.toEqual({ id: "a1", title: "Hello" });

    const doc = await Doc.get("a1");

    await expect(Doc.one("a1")).resolves.toEqual({ id: "a1", title: "Hello" });

    await doc.set({ title: "Bye" });
    await expect(Doc.connection.select(Doc.ref, [])).resolves.toEqual([{ doc_id: "a1", title: "Bye" }]);

    await doc.delete();
    await expect(Doc.one("a1", false)).resolves.toBeUndefined();
  })
})

describe("null", () => {
  function define() {
    class NullRef extends Type {
      name = str();
    }

    class NullRow extends Type {
      s = str(orNull);
      n = num(orNull);
      b = bool(orNull);
      d = date(orNull);
      u = uuid(orNull);
      j = json<{ a: number }>(orNull);
      o = one(NullRef, orNull);
    }

    return { NullRef, NullRow };
  }

  const empty = { s: undefined, n: undefined, b: undefined, d: undefined, u: undefined, j: undefined, o: undefined };

  it("will read null as undefined", async () => {
    const { NullRef, NullRow } = define();
    const connection = memory();

    NullRef.connection = connection;
    NullRow.connection = connection;

    const omitted = await NullRow.insert({ s: null });
    const nulls = await NullRow.insert({ s: null, n: null, b: null, d: null, u: null, j: null, o: null });

    expect(omitted).toEqual({ id: omitted.id, ...empty });
    expect(nulls).toEqual({ id: nulls.id, ...empty });
    expect(Object.values(nulls).filter(x => x === null)).toEqual([]);
    expect(Object.values(await NullRow.one(nulls.id)).filter(x => x === null)).toEqual([]);
    expect(await NullRow.find()).toEqual([{ id: nulls.id, ...empty }, { id: omitted.id, ...empty }]);

    const entity = await NullRow.get(nulls.id);

    expect(entity.columns).toEqual({ id: nulls.id, ...empty });
    expect(Object.values(entity.get()).filter(x => x === null)).toEqual([]);

    const [projected] = await Query(where => {
      const row = where(NullRow);

      where(row.id).equal(nulls.id);

      return { n: row.n, s: row.s, row };
    });

    expect(projected).toEqual({ n: undefined, s: undefined, row: { id: nulls.id, ...empty } });
    await expect(Query(where => where(NullRow).n)).resolves.toEqual([undefined, undefined]);
  })

  it("will write null to clear each column", async () => {
    const { NullRef, NullRow } = define();
    const connection = memory();

    NullRef.connection = connection;
    NullRow.connection = connection;

    const ref = await NullRef.new({ name: "Ref" });
    const entity = await NullRow.new({ s: "a", n: 2, b: true, d: new Date(0), u: "x1", j: { a: 1 }, o: ref });

    expect(entity.columns).toEqual({ id: entity.id, s: "a", n: 2, b: true, d: new Date(0), u: "x1", j: { a: 1 }, o: ref.id });

    await entity.set({ s: null, n: null, b: null, d: null, u: null, j: null, o: null });

    expect(entity.columns).toEqual({ id: entity.id, ...empty });
    expect(Object.values(entity.get()).filter(x => x === null)).toEqual([]);
    await expect(NullRow.one(entity.id)).resolves.toEqual({ id: entity.id, ...empty });

    await NullRow.update(entity.id, { n: 3 });
    await NullRow.update(entity.id, { n: null });

    expect(entity.n).toBeUndefined();
    await expect(NullRow.one(entity.id)).resolves.toEqual({ id: entity.id, ...empty });
  })
})

describe("now", () => {
  class Event extends connect() {
    name = str();
    at = date(null);
  }

  function near(value: Date | undefined){
    expect(value).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - value!.getTime())).toBeLessThan(1000);
  }

  it("will write the current time", async () => {
    const { id, at } = await Event.insert({ name: "a", at: now });

    near(at);

    const event = await Event.get(id);

    await Event.update(id, { at: null });
    await Event.update(id, { at: now });

    near(event.at);
  })

  it("will compare with the current time", async () => {
    await Event.insert({ name: "past", at: new Date(1000) });

    const past = await Event.find({ at: lessThan(now) });

    expect(past.map(event => event.name)).toContain("past");
  })

  it("will not accept now for other columns", () => {
    // @ts-expect-error
    void (() => Event.insert({ name: now }));
  })
})

describe("created and updated", () => {
  class Post extends connect() {
    title = str();
    created = date.created();
    updated = date.updated(null);
  }

  it("will be optional on insert", async () => {
    const created: Date = ({} as Post).created;
    const updated: Date | undefined = ({} as Post).updated;
    const post = await Post.insert({ title: "a", created: new Date(1), updated: new Date(1) });

    expect([created, updated, post.created]).toEqual([undefined, undefined, new Date(1)]);
  })

  it("will keep created and touch updated on update", async () => {
    const { id } = await Post.insert({ title: "a", created: new Date(1), updated: new Date(1) });

    await Post.update(id, { title: "b", created: new Date(2) });

    const post = await Post.one(id);

    expect(post.created).toEqual(new Date(1));
    expect(post.updated!.getTime()).toBeGreaterThan(1);
  })

  it("will take an updated value given", async () => {
    const { id } = await Post.insert({ title: "a", created: new Date(1), updated: new Date(1) });

    await Post.update(id, { updated: new Date(5) });

    expect((await Post.one(id)).updated).toEqual(new Date(5));
  })

  it("will keep created and touch updated on upsert", async () => {
    const { id } = await Post.insert({ title: "a", created: new Date(1), updated: new Date(1) });
    const post = await Post.insert({ id, title: "b", created: new Date(3) }, { conflict: "update" });

    expect(post.created).toEqual(new Date(1));
    expect(post.updated!.getTime()).toBeGreaterThan(1);
  })
})

describe("query writes", () => {
  let Item: ReturnType<typeof table>;

  function table(){
    return class Item extends connect() {
      kind = str();
      file = str();
      note = str(null);
      revised = date.updated(null);
    }
  }

  async function seed(live = true){
    Item = table();

    if (!live)
      Object.defineProperty(Item.connection, "subscribe", { value: undefined });

    await Item.insert({ kind: "a", file: "1" });
    await Item.insert({ kind: "a", file: "2", note: "x" });
    await Item.insert({ kind: "b", file: "1" });
  }

  it("will count matching rows", async () => {
    await seed();

    expect(await Item.count()).toBe(3);
    expect(await Item.count({ kind: "a" })).toBe(2);
    expect(await Item.count({ kind: "a", file: "1" })).toBe(1);
    expect(await Item.count({ note: isNull() })).toBe(2);
    expect(await Item.count({ note: notNull() })).toBe(1);
    expect(await Item.count({ file: isIn(["1", "3"]) })).toBe(2);
    expect(await Item.count({ kind: notEqual("a") })).toBe(1);
    expect(await Item.count({ kind: "a", id: asc() })).toBe(2);
    expect(await Item.count({ file: isLike("1%") })).toBe(2);
  })

  it("will update matching rows and settle loaded ones", async () => {
    await seed();

    const first = await Item.get(1);
    const third = await Item.get(3);
    const count = await Item.update({ file: "1" }, { note: "y" });

    expect(count).toBe(2);
    expect([first.note, third.note]).toEqual(["y", "y"]);
    expect(first.revised).toBeInstanceOf(Date);
    expect((await Item.one(2)).note).toBe("x");
    expect(await Item.update({ kind: "a" }, { note: "w" })).toBe(2);
    expect(first.note).toBe("w");
  })

  it("will update without anything loaded", async () => {
    await seed();

    expect(await Item.update({ kind: "b" }, { note: "z" })).toBe(1);
    expect((await Item.one(3)).note).toBe("z");
  })

  it("will delete matching rows and retire loaded ones", async () => {
    await seed(false);

    const first = await Item.get(1);
    const second = await Item.get(2);
    const count = await Item.delete({ file: "1" });

    expect(count).toBe(2);
    expect(second.get(null)).toBeFalsy();
    expect(Item.loaded.has(1)).toBe(false);
    expect(await Item.count()).toBe(1);
    expect(first.get(null)).toBeTruthy();
  })

  it("will delete without anything loaded", async () => {
    await seed();

    expect(await Item.delete({ kind: "a" })).toBe(2);
  })

  it("will throw for an empty query", async () => {
    await seed();
    await expect(Item.update({}, { note: "y" })).rejects.toThrow("Item needs a condition to write by query.");
    await expect(Item.delete({ id: asc() })).rejects.toThrow("Item needs a condition to write by query.");
  })

  it("will match a composite key", async () => {
    class Tag extends connect() {
      id = key(() => [this.post, this.name]);
      post = num();
      name = str();
      note = str(null);
    }

    await Tag.insert({ post: 1, name: "a" });
    await Tag.insert({ post: 1, name: "b" });

    const tag = await Tag.get([1, "a"]);

    expect(await Tag.update({ id: tag.id }, { note: "n" })).toBe(1);
    expect(tag.note).toBe("n");
    expect(await Tag.count({ id: tag.id })).toBe(1);
    await expect(Tag.count({ id: isIn([tag.id]) })).rejects.toThrow("Tag.id is a composite key and can only be matched or ordered.");
  })
})

describe("insert conflict", () => {
  class Asset extends connect() {
    id = str({ primary: true });
    file = str({ unique: true });
    made = num();
  }

  it("will update a conflicting row", async () => {
    await Asset.insert({ id: "a", file: "one", made: 1 });

    const row = await Asset.insert({ id: "a", file: "two", made: 2 }, { conflict: "update" });

    expect(row).toEqual({ id: "a", file: "two", made: 2 });
    await expect(Asset.find()).resolves.toEqual([row]);
  })

  it("will replace every column but the key", async () => {
    class Image extends connect() {
      id = str({ primary: true });
      prompt = str(null);
      seed = num(null);
      created = date.created(null);
    }

    await Image.insert({ id: "a", prompt: "p", seed: 1, created: new Date(1) });

    const row = await Image.insert({ id: "a", seed: 2 }, { conflict: "replace" });

    expect(row).toEqual({ id: "a", prompt: undefined, seed: 2, created: new Date(1) });
  })

  it("will keep columns on conflict", async () => {
    await Asset.insert({ id: "b", file: "three", made: 1 });

    const row = await Asset.insert({ id: "b", file: "four", made: 2 }, { conflict: "update", keep: ["made"] });

    expect(row).toEqual({ id: "b", file: "four", made: 1 });
  })

  it("will return the row with nothing left to update", async () => {
    await Asset.insert({ id: "c", file: "five", made: 1 });

    const row = await Asset.insert({ id: "c", file: "six", made: 2 }, { conflict: "update", keep: ["file", "made"] });

    expect(row).toEqual({ id: "c", file: "five", made: 1 });
  })

  it("will ignore a conflicting row", async () => {
    await Asset.insert({ id: "d", file: "seven", made: 1 });

    const row = await Asset.insert({ id: "d", file: "eight", made: 2 }, { conflict: "ignore" });

    expectTypeOf(row).toEqualTypeOf<Type.Columns<Asset> | undefined>();

    const conflict = "update" as "update" | "ignore";

    expectTypeOf(Asset.insert({ id: "z", file: "z", made: 0 }, { conflict })).resolves.toEqualTypeOf<Type.Columns<Asset> | undefined>();
    expectTypeOf(Asset.insert({ id: "z", file: "z", made: 0 }, { conflict: "update" })).resolves.toEqualTypeOf<Type.Columns<Asset>>();
    expect(row).toBeUndefined();
    await expect(Asset.one("d")).resolves.toEqual({ id: "d", file: "seven", made: 1 });
  })

  it("will insert when nothing conflicts", async () => {
    await expect(Asset.insert({ id: "e", file: "nine", made: 1 }, { conflict: "ignore" }))
      .resolves.toEqual({ id: "e", file: "nine", made: 1 });
  })

  it("will target a unique column", async () => {
    await Asset.insert({ id: "f", file: "ten", made: 1 });

    const row = await Asset.insert({ id: "g", file: "ten", made: 2 }, { conflict: "update", on: "file" });

    expect(row).toEqual({ id: "g", file: "ten", made: 2 });
  })

  it("will settle a loaded entity", async () => {
    await Asset.insert({ id: "h", file: "eleven", made: 1 });

    const asset = await Asset.get("h");

    await Asset.insert({ id: "h", file: "twelve", made: 2 }, { conflict: "update" });

    expect(asset.file).toBe("twelve");
  })
})

describe("composite key", () => {
  const db = memory();

  class Account extends Type {
    static connection = db;
    id = num({ primary: true, increment: true });
    name = str();
  }

  class Pick extends Type {
    static connection = db;
    id = key(() => [this.account, this.kind]);
    account = one(Account);
    kind = str();
    note = str(orNull);
  }

  const A = '[1,"a"]';

  it("will type id as a key of its parts", () => {
    const pick = {} as Pick;
    const user = {} as Account;
    const id: string = pick.id;
    const plain: string | number = user.id;

    () => {
      Pick.get([1, "a"]);
      Pick.get(pick.id);

      // @ts-expect-error
      Pick.get(["1", "a"]);

      // @ts-expect-error
      Pick.get([1, 2]);

      // @ts-expect-error
      Pick.get("loose");
    };

    void id;
    void plain;
  })

  it("will not store a key column", () => {
    expect(Array.from(Pick.fields.values(), field => field.column)).toEqual(["id", "account_id", "kind", "note"]);
    expect(Pick.fields.get("id")!.parts).toEqual([Pick.fields.get("account"), Pick.fields.get("kind")]);
  })

  it("will read rows keyed by their parts", async () => {
    await Account.insert({ name: "Gabe" });

    const row = await Pick.insert({ account: 1, kind: "a", note: "first" });

    expect(row).toEqual({ id: A, account: 1, kind: "a", note: "first" });
    await expect(db.select(Pick.ref, [])).resolves.toEqual([{ account_id: 1, kind: "a", note: "first" }]);
    await expect(Pick.one([1, "a"])).resolves.toEqual(row);
    await expect(Pick.one(row.id)).resolves.toEqual(row);
  })

  it("will get an entity by tuple or key", async () => {
    const pick = await Pick.get([1, "a"]);

    expect(pick.note).toBe("first");
    expect(pick.id).toBe(A);
    expect(pick.columns).toEqual({ id: A, account: 1, kind: "a", note: "first" });
    expect(Pick.get(A as Pick["id"])).toBe(pick);
    expect(Pick.get([1, "a"])).toBe(pick);
  })

  it("will update and settle by key", async () => {
    const pick = await Pick.get([1, "a"]);

    await Pick.update([1, "a"], { note: "second" });

    expect(pick.note).toBe("second");
    await expect(Pick.one(pick.id)).resolves.toMatchObject({ note: "second" });
  })

  it("will rekey an entity when a part changes", async () => {
    const pick = await Pick.get([1, "a"]);

    await pick.set({ kind: "b" });

    expect(pick.id).toBe('[1,"b"]');
    expect(Pick.get([1, "b"])).toBe(pick);

    await Pick.update(pick.id, { kind: "a" });

    expect(Pick.get([1, "a"])).toBe(pick);
  })

  it("will settle a live change", async () => {
    const pick = await Pick.get([1, "a"]);

    await db.update(Pick.ref, [1, "a"], { note: "live" });
    await settled();

    expect(pick.note).toBe("live");
  })

  it("will order by key parts", async () => {
    await Pick.insert({ account: 1, kind: "c" });

    const rows = await Pick.find();

    expect(rows.map(row => row.kind)).toEqual(["c", "a"]);
  })

  it("will throw comparing a composite key", async () => {
    await expect(Pick.find({ id: greaterThan(A) }))
      .rejects.toThrow("Pick.id is a composite key and can only be matched or ordered.");
  })

  it("will select through a query", async () => {
    const [entity] = await Pick.query((pick, where) => { where(pick.kind).equal("a") });
    const [nested] = await Query(where => {
      const pick = where(Pick);

      where(pick.kind).equal("c");

      return { pick };
    });

    expect(entity).toEqual({ id: A, account: 1, kind: "a", note: "live" });
    expect(nested).toEqual({ pick: { id: '[1,"c"]', account: 1, kind: "c", note: undefined } });
  })

  it("will create and delete entities", async () => {
    const pick = await Pick.new({ account: 1, kind: "d" });

    expect(Pick.get([1, "d"])).toBe(pick);

    await pick.delete();

    expect(Pick.loaded.has('[1,"d"]')).toBe(false);

    await Pick.get([1, "c"]);
    await Pick.delete([1, "c"]);

    expect(Pick.loaded.has('[1,"c"]')).toBe(false);
    await expect(Pick.one([1, "c"], false)).resolves.toBeUndefined();
  })

  it("will upsert on the composite key", async () => {
    const row = await Pick.insert({ account: 1, kind: "a", note: "upsert" }, { conflict: "update" });

    expect(row).toEqual({ id: A, account: 1, kind: "a", note: "upsert" });
    await expect(Pick.insert({ account: 1, kind: "a" }, { conflict: "ignore" })).resolves.toBeUndefined();
  })

  it("will throw relating to a composite key", async () => {
    class Ref extends Type {
      static connection = db;
      pick = one(Pick);
    }

    expect(() => Ref.fields.get("pick")!.reference)
      .toThrow("Ref.pick cannot relate to Pick, which has a composite key.");
  })

  it("will throw keying by anything but fields", async () => {
    class Bad extends connect() {
      id = key(() => [this.kind, 1]);
      kind = str();
    }

    await expect(Bad.find()).rejects.toThrow("Bad.id must list fields to key by, like key(() => [this.a, this.b]).");
  })

  it("will throw when the key arrow throws", async () => {
    class Bad extends connect() {
      id = key(() => [(this.kind as any).length.value]);
      kind = str();
    }

    await expect(Bad.find()).rejects.toThrow("Bad.id must list fields to key by, like key(() => [this.a, this.b]).");
  })
})

describe("journal", () => {
  function journaled(){
    const db = memory();
    const record: Connection.Journal = { undo: [], done: [] };
    let open = false;

    Object.defineProperty(db, "subscribe", { value: undefined });
    Object.assign(db, { _journal: () => open ? record : undefined });

    const begin = () => {
      open = true;
      record.undo.length = record.done.length = 0;
    };

    const end = (commit: boolean) => {
      open = false;
      (commit ? record.done : record.undo.reverse()).forEach(apply => apply());
    };

    return { db, begin, end };
  }

  it("will undo a set", async () => {
    const { db, begin, end } = journaled();

    class User extends Type {
      static connection = db;
      name = str();
    }

    const user = await User.new({ name: "Gabe" });

    begin();
    await user.set({ name: "Bob" });
    await User.update(user.id, { name: "Ann" });

    expect(user.name).toBe("Ann");

    end(false);

    expect(user.name).toBe("Gabe");
  })

  it("will undo a relation not yet loaded", async () => {
    const { db, begin, end } = journaled();

    class User extends Type {
      static connection = db;
      name = str();
    }

    class Post extends Type {
      static connection = db;
      author = one(User, lazy);
    }

    await User.insert({ name: "Gabe" });
    await User.insert({ name: "Bob" });
    await Post.insert({ author: 1 });

    const post = await Post.get(1);

    begin();
    await post.set({ author: 2 });

    expect(post.columns.author).toBe(2);

    end(false);

    expect(post.columns.author).toBe(1);
  })

  it("will write to a reference still loading", async () => {
    const { db, begin, end } = journaled();
    const { select } = db;
    let resume!: () => void;

    class Item extends Type {
      static connection = db;
      label = str();
    }

    await Item.insert({ label: "x" });

    Object.assign(db, {
      select: (...args: Parameters<typeof select>) => new Promise<void>(resolve => resume = resolve).then(() => select(...args))
    });

    const item = Item.get(1);

    begin();
    await expect(Item.update(1, { label: "y" })).resolves.toBeUndefined();
    end(true);

    resume();

    await expect(item).resolves.toBe(item);
    expect(item.label).toBe("y");
  })

  it("will undo a settled upsert", async () => {
    const { db, begin, end } = journaled();

    class Asset extends Type {
      static connection = db;
      id = str({ primary: true });
      file = str();
    }

    await Asset.insert({ id: "a", file: "one" });

    const asset = await Asset.get("a");

    begin();
    await Asset.insert({ id: "a", file: "two" }, { conflict: "update" });

    expect(asset.file).toBe("two");

    end(false);

    expect(asset.file).toBe("one");
  })

  it("will evict a created entity on undo", async () => {
    const { db, begin, end } = journaled();

    class User extends Type {
      static connection = db;
      name = str();
    }

    begin();

    const user = await User.new({ name: "Gabe" });

    end(false);

    expect(user.get(null)).toBe(true);
    expect(User.loaded.size).toBe(0);
  })

  it("will evict a deleted entity once done", async () => {
    const { db, begin, end } = journaled();

    class User extends Type {
      static connection = db;
      name = str();
    }

    const gabe = await User.new({ name: "Gabe" });
    const bob = await User.new({ name: "Bob" });

    begin();
    await gabe.delete();
    await User.delete(bob.id);

    expect(gabe.get(null)).toBe(false);
    expect(User.loaded.size).toBe(2);

    end(true);

    expect(gabe.get(null)).toBe(true);
    expect(bob.get(null)).toBe(true);
    expect(User.loaded.size).toBe(0);
  })

  it("will rekey a composite entity on undo", async () => {
    const { db, begin, end } = journaled();

    class Pick extends Type {
      static connection = db;
      id = key(() => [this.account, this.kind]);
      account = num();
      kind = str();
    }

    await Pick.insert({ account: 1, kind: "a" });

    const pick = await Pick.get([1, "a"]);

    begin();
    await pick.set({ kind: "b" });

    expect(Pick.get([1, "b"])).toBe(pick);

    end(false);

    expect(pick.id).toBe('[1,"a"]');
    expect(Pick.get([1, "a"])).toBe(pick);
    expect(Pick.loaded.has('[1,"b"]')).toBe(false);
  })
})
