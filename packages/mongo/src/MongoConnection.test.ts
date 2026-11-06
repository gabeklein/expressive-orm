import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, describe, expect, inject, it, vi } from 'vitest';

import { Connection, key, num, one, Query, str, Type } from '@expressive/orm';

import { MongoConnection } from './MongoConnection';

const client = new MongoClient(inject('mongo'));
let count = 0;

afterAll(() => client.close());

function connect(types: Connection.Types = []) {
  return MongoConnection.new(types, client, `test_${count++}`);
}

function table() {
  const db = connect();

  return class Table extends Type {
    static connection = db;
  };
}

async function seed<T extends Type>(type: Type.Class<T>, ...rows: Type.Insert<T>[]) {
  const out: Type.Columns<T>[] = [];

  for (const row of rows)
    out.push(await type.insert(row));

  return out;
}

describe("insert", () => {
  it("will assign incrementing ids", async () => {
    const db = connect();

    await expect(db.insert("user", { name: "A" }, true)).resolves.toEqual({ id: 1, name: "A" });
    await expect(db.insert("user", { name: "B" }, true)).resolves.toEqual({ id: 2, name: "B" });
    await expect(db.db.collection("user").findOne({ name: "B" })).resolves.toEqual({ _id: 2, name: "B" });
  })

  it("will not return row unless asked", async () => {
    const db = connect();

    await expect(db.insert("user", { name: "A" })).resolves.toBeUndefined();
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })

  it("will continue after explicit id", async () => {
    const db = connect();

    await db.insert("user", { id: 5 });
    await db.insert("user", { id: 2 });

    await expect(db.insert("user", {}, true)).resolves.toEqual({ id: 6 });
  })

  it("will ignore a conflict", async () => {
    const db = connect();

    await db.insert("user", { id: 1, name: "A" });

    await expect(db.insert("user", { id: 1, name: "B" }, true, { on: ["id"] })).resolves.toBeUndefined();
    await expect(db.insert("user", { id: 2, name: "B" }, true, { on: ["id"] })).resolves.toEqual({ id: 2, name: "B" });
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
  })

  it("will update on conflict", async () => {
    const db = connect();

    await db.insert("user", { name: "A", age: 1 });

    await expect(db.insert("user", { name: "A", age: 2 }, true, { on: ["name"], update: ["age"], set: { seen: true } }))
      .resolves.toEqual({ id: 1, name: "A", age: 2, seen: true });

    await expect(db.insert("user", { name: "B", age: 3 }, true, { on: ["name"], update: ["age"], set: { seen: true } }))
      .resolves.toEqual({ id: 2, name: "B", age: 3 });
  })
})

describe("select", () => {
  const db = connect();
  const ready = (async () => {
    for (const [name, age] of [["Gabe", 30], ["Alice", 25], ["Bob", null], ["alex", 25]] as const)
      await db.insert("user", { name, age });
  })();

  async function ids(...constraints: [string, string, any?][]) {
    await ready;
    const rows = await db.select("user", constraints);
    return rows.map(row => row.id);
  }

  it.each([
    ["=", 25, [2, 4]],
    ["!=", 25, [1]],
    [">", 25, [1]],
    ["<", 30, [2, 4]],
    [">=", 25, [1, 2, 4]],
    ["<=", 25, [2, 4]],
    ["IN", [30, null], [1]],
    ["NOT IN", [30], [2, 4]],
    ["IS NULL", undefined, [3]],
    ["IS NOT NULL", undefined, [1, 2, 4]]
  ])("will match %s", async (op, value, expected) => {
    await expect(ids(["age", op, value])).resolves.toEqual(expected);
  })

  it("will match LIKE", async () => {
    await expect(ids(["name", "LIKE", "A%"])).resolves.toEqual([2]);
    await expect(ids(["name", "LIKE", "_ob"])).resolves.toEqual([3]);
  })

  it("will sort, limit and offset", async () => {
    await ready;
    const rows = await db.select("user", [["name", "desc"]], 2, 1);

    expect(rows.map(row => row.name)).toEqual(["Gabe", "Bob"]);
  })

  it("will match by id", async () => {
    await expect(ids(["id", "IN", [1, 3]])).resolves.toEqual([1, 3]);
  })

  it("will throw on unknown operator", async () => {
    await expect(ids(["age", "~", 1])).rejects.toThrow("Unsupported operator: ~");
  })
})

describe("update and remove", () => {
  it("will update by id", async () => {
    const db = connect();

    await db.insert("user", { name: "A" });
    await db.update("user", 1, { name: "B" });
    await db.update("user", 1, {});

    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "B" }]);
  })

  it("will change an id", async () => {
    const db = connect();

    await db.insert("user", { name: "A" });
    await db.update("user", 1, { id: 7, name: "B" });

    await expect(db.select("user", [])).resolves.toEqual([{ id: 7, name: "B" }]);
    await expect(db.insert("user", {}, true)).resolves.toEqual({ id: 8 });
  })

  it("will remove by id", async () => {
    const db = connect();

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });
    await db.remove("user", 1);

    await expect(db.select("user", [])).resolves.toEqual([{ id: 2, name: "B" }]);
  })
})

describe("entities", () => {
  class User extends Type {
    name = str();
    email = str({ unique: true });
    nick = str({ unique: true, nullable: true });
    age = num({ index: true });
  }

  connect([User]);

  it("will create, read, update and delete", async () => {
    await User.connection;

    const user = await User.new({ name: "Gabe", email: "gabe@a.co", age: 30 });

    expect(user.id).toBe(1);

    await User.update(user.id, { age: 31 });
    expect(user.age).toBe(31);

    await expect(User.one({ email: "gabe@a.co" })).resolves.toMatchObject({ name: "Gabe", age: 31 });
    await expect(User.update({ age: 31 }, { name: "G" })).resolves.toBe(1);
    expect(user.name).toBe("G");

    await User.delete(user.id);
    await expect(User.count()).resolves.toBe(0);
  })

  it("will create indexes on sync", async () => {
    await User.connection;

    const indexes = await (User.connection as MongoConnection).db.collection("user").indexes();

    expect(indexes.map(index => [index.name, !!index.unique]).sort()).toEqual([
      ["_id_", false],
      ["user_age", false],
      ["user_email", true],
      ["user_nick", true]
    ]);

    await User.insert({ name: "A", email: "x", age: 1 });
    await User.insert({ name: "B", email: "y", age: 1 });
    await expect(User.insert({ name: "C", email: "x", age: 1 })).rejects.toThrow(/duplicate key/);
  })

  it("will upsert by unique field", async () => {
    await User.insert({ name: "A", email: "up", age: 1 });
    await User.insert({ name: "B", email: "up", age: 2 }, { conflict: "update", on: "email" });

    await expect(User.one({ email: "up" })).resolves.toMatchObject({ name: "B", age: 2 });
  })
})

describe("composite key", () => {
  class Tag extends Type {
    static table = "tag";
    id = key(() => [this.post, this.label]);
    post = num();
    label = str();
    weight = num();
  }

  connect([Tag]);

  it("will store parts as columns", async () => {
    await Tag.connection;
    await Tag.insert({ post: 1, label: "a", weight: 1 });
    await Tag.insert({ post: 1, label: "b", weight: 2 });

    await Tag.update(JSON.stringify([1, "a"]) as any, { weight: 5 });
    await expect(Tag.one({ label: "a" })).resolves.toMatchObject({ weight: 5 });

    await Tag.delete(JSON.stringify([1, "b"]) as any);
    await expect(Tag.count()).resolves.toBe(1);
    await expect(Tag.insert({ post: 1, label: "a", weight: 1 })).rejects.toThrow(/duplicate key/);
  })
})

describe("query", () => {
  class Author extends table() {
    static table = "author";
    name = str();
  }

  class Post extends Type {
    static connection = Author.connection;
    static table = "post";
    author = one(Author);
    editor = one(Author, { nullable: true });
    title = str();
    views = num();
  }

  const ready = (async () => {
    const [ann, ben] = await seed(Author, { name: "Ann" }, { name: "Ben" });

    await seed(Post,
      { author: ann, title: "first", views: 10 },
      { author: ben, editor: ann, title: "second", views: 5 },
      { author: ann, title: "third", views: 1 }
    );
  })();

  it("will push a single-table query to Mongo", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);

      where(post.views).over(2);
      where(post.views).desc();
      where(5);

      return { title: post.title, views: post.views };
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$match":{"views":{"$gt":2}}},{"$sort":{"views":-1,"_id":1}},{"$limit":5},{"$project":{"title":1,"views":1,"_id":0}}])"`);
    await expect(query).resolves.toEqual([
      { title: "first", views: 10 },
      { title: "second", views: 5 }
    ]);
  })

  it("will count", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);

      where(post.views).under(10);
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$match":{"views":{"$lt":10}}},{"$count":"count"}])"`);
    await expect(query).resolves.toBe(2);
  })

  it("will bind parameters", async () => {
    await ready;
    const query = Query(where => (min: number) => {
      const post = where(Post);

      where(post.views).over(min, true);
      where(post.id).asc();

      return post.id;
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$match":{"views":{"$gte":"$0"}}},{"$sort":{"_id":1}},{"$project":{"_id":1}}])"`);
    await expect(query(5)).resolves.toEqual([1, 2]);
    await expect(query(1)).resolves.toEqual([1, 2, 3]);
  })

  it("will group clauses", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);

      where(
        where(post.views).equal(1),
        where(post.title).equal("second")
      );

      return post.title;
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$match":{"$or":[{"views":{"$eq":1}},{"title":{"$eq":"second"}}]}},{"$project":{"title":1,"_id":0}}])"`);
    await expect(query).resolves.toEqual(["second", "third"]);
  })

  it("will join a relation with $lookup", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);

      where(post.author.name).equal("Ann");
      where(post.views).over(0);
      where(post.views).desc();

      return { title: post.title, author: post.author.name };
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$match":{"views":{"$gt":0}}},{"$lookup":{"from":"author","localField":"author_id","foreignField":"_id","as":"__1","pipeline":[{"$match":{"name":{"$eq":"Ann"}}}]}},{"$unwind":{"path":"$__1","preserveNullAndEmptyArrays":false}},{"$sort":{"views":-1,"_id":1}},{"$project":{"title":1,"__1.name":1,"_id":0}}])"`);
    await expect(query).resolves.toEqual([
      { title: "first", author: "Ann" },
      { title: "third", author: "Ann" }
    ]);
  })

  it("will left join a nullable relation", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);

      where(post.id).asc();
      where(post.editor.name).not("Zed");

      return { id: post.id, editor: post.editor.name };
    });

    expect(String(query)).toMatchInlineSnapshot(`"db.post.aggregate([{"$lookup":{"from":"author","localField":"editor_id","foreignField":"_id","as":"__1"}},{"$unwind":{"path":"$__1","preserveNullAndEmptyArrays":true}},{"$match":{"__1.name":{"$nin":["Zed",null]}}},{"$sort":{"_id":1}},{"$project":{"_id":1,"__1.name":1}}])"`);

    await expect(query).resolves.toEqual([{ id: 2, editor: "Ann" }]);
  })

  it("will fall back to evaluate for computed values", async () => {
    await ready;
    const query = Query((where, fn) => {
      const post = where(Post);

      where(post.title).equal("first");

      return fn.add(post.views, 1);
    });

    expect(String(query)).toMatch(/^evaluate\n/);
    await expect(query).resolves.toEqual([11]);
  })

  it("will fall back for a join on several columns", async () => {
    await ready;
    const query = Query(where => {
      const post = where(Post);
      const other = where(Post);

      where(other.views).under(post.views);
      where(other.id).not(post.id);
      where(post.views).equal(10);

      return other.title;
    });

    expect(String(query)).toMatch(/^evaluate\n/);
    await expect(query).resolves.toEqual(["second", "third"]);
  })

  it("will fall back for input data", async () => {
    await ready;
    const query = Query(where => {
      const { title } = where([{ title: "first" }, { title: "third" }]);
      const post = where(Post);

      where(post.title).equal(title);

      return post.views;
    });

    expect(String(query)).toMatch(/^evaluate\n/);
    await expect(query).resolves.toEqual([10, 1]);
  })
})

describe("query writes", () => {
  class Item extends table() {
    static table = "item";
    name = str();
    count = num();
  }

  it("will update and delete in Mongo", async () => {
    await seed(Item, { name: "a", count: 1 }, { name: "b", count: 2 }, { name: "c", count: 3 });

    const update = Query(where => {
      const item = where(Item);

      where(item.count).over(1);
      where(item).update({ name: "z" });
    });

    expect(String(update)).toMatchInlineSnapshot(`"db.item.updateMany({"count":{"$gt":1}}, {"$set":{"name":"z"}})"`);
    await expect(update).resolves.toBe(2);

    const remove = Query(where => {
      const item = where(Item);

      where(item.name).equal("z");
      where(item).delete();
    });

    expect(String(remove)).toMatchInlineSnapshot(`"db.item.deleteMany({"name":{"$eq":"z"}})"`);
    await expect(remove).resolves.toBe(2);
    await expect(Item.connection.select("item", [])).resolves.toEqual([{ id: 1, name: "a", count: 1 }]);
  })

  it("will update computed values through evaluate", async () => {
    const [{ id }] = await seed(Item, { name: "d", count: 1 });

    const query = Query((where, fn) => {
      const item = where(Item);

      where(item.id).equal(id);
      where(item).update({ count: fn.add(item.count, 1) });
    });

    expect(String(query)).toMatch(/^evaluate\n/);
    await expect(query).resolves.toBe(1);
    await expect(Item.one(id)).resolves.toMatchObject({ count: 2 });
  })

  it("will insert and delete through evaluate", async () => {
    const query = Query(where => {
      where(Item, { name: "e", count: 9 });
    });

    await expect(query).resolves.toBe(1);

    const remove = Query(where => {
      const item = where(Item);
      const other = where(Item);

      where(other.id).equal(item.id);
      where(item.count).equal(9);
      where(item).delete();
    });

    expect(String(remove)).toMatch(/^evaluate\n/);
    await expect(remove).resolves.toBe(1);
  })
})

describe("transaction", () => {
  class Account extends Type {
    static table = "account";
    balance = num();
  }

  connect([Account]);

  it("will commit", async () => {
    await Account.connection;

    const db = Account.connection as MongoConnection;

    await db.transaction(async () => {
      await Account.insert({ balance: 10 });
      await db.transaction(() => Account.insert({ balance: 20 }));
    });

    await expect(Account.count()).resolves.toBe(2);
  })

  it("will roll back", async () => {
    const db = Account.connection as MongoConnection;
    const account = await Account.new({ balance: 5 });

    await expect(db.transaction(async () => {
      await Account.update(account.id, { balance: 0 });
      await Account.insert({ balance: 1 });

      expect(account.balance).toBe(0);
      throw new Error("nope");
    })).rejects.toThrow("nope");

    expect(account.balance).toBe(5);
    await expect(Account.one(account.id)).resolves.toMatchObject({ balance: 5 });
    await expect(Account.count()).resolves.toBe(3);
  })
})

describe("subscribe", () => {
  it("will update a loaded entity from a change stream", async () => {
    class Note extends Type {
      static table = "note";
      text = str();
    }

    connect([Note]);

    await Note.connection;

    const note = await Note.new({ text: "a" });
    const db = Note.connection as MongoConnection;

    await new Promise(resolve => setTimeout(resolve, 500));
    await db.db.collection("note").updateOne({ _id: note.id as any }, { $set: { text: "b" } });

    await vi.waitFor(() => expect(note.text).toBe("b"), { timeout: 5000 });
  })

  it("will report inserts, updates and deletes", async () => {
    const db = connect();
    const listener = vi.fn();
    const stop = db.subscribe(listener);

    await new Promise(resolve => setTimeout(resolve, 500));
    await db.insert("thing", { name: "a" });
    await db.update("thing", 1, { name: "b" });
    await db.db.collection("thing").updateOne({ _id: 1 as any }, { $unset: { name: "" } });
    await db.db.collection("thing").replaceOne({ _id: 1 as any }, { name: "c" });
    await db.remove("thing", 1);

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(5), { timeout: 5000 });
    stop();

    expect(listener.mock.calls.map(([change]) => change)).toEqual([
      { table: "thing", op: "insert", id: 1, row: { id: 1, name: "a" } },
      { table: "thing", op: "update", id: 1, row: { name: "b" } },
      { table: "thing", op: "update", id: 1, row: { name: null } },
      { table: "thing", op: "update", id: 1, row: { id: 1, name: "c" } },
      { table: "thing", op: "delete", id: 1 }
    ]);
  })
})

describe("standalone", () => {
  it("will not stream changes without a replica set", async () => {
    const single = await MongoMemoryServer.create();
    const db = MongoConnection.new([], single.getUri(), "solo");
    const listener = vi.fn();

    db.subscribe(listener);
    await db.insert("thing", { name: "a" });

    await vi.waitFor(() => expect(db._streams.size).toBe(0), { timeout: 5000 });
    expect(listener).not.toHaveBeenCalled();

    await expect(db.transaction(() => db.insert("thing", {}))).rejects.toThrow(/replica set/);

    await db.close();
    await single.stop();
  }, 60_000)
})
