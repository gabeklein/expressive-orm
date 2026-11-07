import { describe, expect, it } from 'vitest';

import { str } from './fields';
import { memory } from './memory';
import { Builder } from './query/Builder';
import { Query } from './query/Query';
import { Type } from './Type';

describe("insert", () => {
  it("will assign incrementing ids", async () => {
    const db = memory();

    await expect(db.insert("user", { name: "A" }, true)).resolves.toEqual({ id: 1, name: "A" });
    await expect(db.insert("user", { name: "B" }, true)).resolves.toEqual({ id: 2, name: "B" });
  })

  it("will not return row unless asked", async () => {
    const db = memory();

    await expect(db.insert("user", { name: "A" })).resolves.toBeUndefined();
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })

  it("will continue after explicit id", async () => {
    const db = memory();

    await db.insert("user", { id: 5 });
    await db.insert("user", { id: 2 });

    await expect(db.insert("user", {}, true)).resolves.toEqual({ id: 6 });
  })

  it("will not share rows", async () => {
    const db = memory();
    const row = await db.insert("user", { name: "A" }, true);

    row.name = "B";

    const [got] = await db.select("user", []);

    got.name = "C";

    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })
})

describe("select", () => {
  const db = memory();
  const ready = (async () => {
    for (const [name, age] of [["Gabe", 30], ["Alice", 25], ["Bob", null], ["alex", 25]] as const)
      await db.insert("user", { name, age });
  })();

  async function ids(...constraints: [string, string, any?][]){
    await ready;
    const rows = await db.select("user", constraints);
    return rows.map(row => row.id);
  }

  it("will return empty for unknown table", async () => {
    await expect(db.select("nope", [])).resolves.toEqual([]);
  })

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
    await expect(ids(["name", "LIKE", "%.%"])).resolves.toEqual([]);
  })

  it("will combine constraints", async () => {
    await expect(ids(["age", "=", 25], ["name", "LIKE", "a%"])).resolves.toEqual([4]);
  })

  it("will sort", async () => {
    await expect(ids(["id", "desc"])).resolves.toEqual([4, 3, 2, 1]);
    await expect(ids(["name", "asc"])).resolves.toEqual([2, 3, 1, 4]);
  })

  it("will sort by many fields", async () => {
    await expect(ids(["age", "IS NOT NULL"], ["age", "asc"], ["id", "desc"])).resolves.toEqual([4, 2, 1]);
  })

  it("will sort null first", async () => {
    await expect(ids(["age", "asc"], ["id", "asc"])).resolves.toEqual([3, 2, 4, 1]);
    await expect(ids(["age", "desc"], ["id", "asc"])).resolves.toEqual([1, 2, 4, 3]);
  })

  it("will keep order of ties", async () => {
    await expect(ids(["age", "=", 25], ["age", "asc"])).resolves.toEqual([2, 4]);
  })

  it("will limit and offset", async () => {
    await ready;

    const page = await db.select("user", [["id", "asc"]], 2, 1);
    const rest = await db.select("user", [["id", "asc"]], undefined, 3);

    expect(page.map(row => row.id)).toEqual([2, 3]);
    expect(rest.map(row => row.id)).toEqual([4]);
  })

  it("will throw on unsupported operator", async () => {
    await expect(ids(["age", "~", 1])).rejects.toThrow("Unsupported operator: ~");
  })
})

describe("update", () => {
  it("will update row by id", async () => {
    const db = memory();

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });
    await db.update("user", 2, { name: "C" });

    await expect(db.select("user", [])).resolves.toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "C" }
    ]);
  })
})

describe("remove", () => {
  it("will remove row by id", async () => {
    const db = memory();

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });
    await db.remove("user", 1);

    await expect(db.select("user", [])).resolves.toEqual([{ id: 2, name: "B" }]);
  })
})

describe("prepare", () => {
  class User extends Type {
    static table = "user";
    static connection = memory();
    name = str();
  }

  it("will render intent as its string", () => {
    let builder!: Builder;

    const query = Query(function(where){
      builder = this;
      where(where(User).name).equal("Gabe");
    });

    expect(String(User.connection.prepare!(builder))).toBe(String(builder));
    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      where user.name = "Gabe"
      select count"
    `);
  })

  it("will refuse templates", async () => {
    await User.insert({ name: "Gabe" });

    const query = Query((where, fn) => {
      const user = where(User);
      where(user.name).equal(fn(`upper('gabe')`) as any);
    });

    await expect(query).rejects.toThrow("Query templates are not supported by this connection.");
  })
})

describe("subscribe", () => {
  class User extends Type {
    static table = "user";
    static connection = memory();
    name = str();
  }

  it("will report writes", async () => {
    const db = memory();
    const changes: unknown[] = [];
    const stop = db.subscribe!(change => changes.push(change));

    await db.insert("user", { name: "A" });
    await db.update("user", 1, { name: "B" });
    await db.update("user", 2, { name: "C" });
    await db.remove("user", 1);

    stop();
    await db.insert("user", { name: "D" });

    expect(changes).toEqual([
      { table: "user", op: "insert", id: 1, row: { id: 1, name: "A" } },
      { table: "user", op: "update", id: 1, row: { name: "B" } },
      { table: "user", op: "delete", id: 1 }
    ]);
  })

  it("will report writes by query", async () => {
    const changes: unknown[] = [];

    User.connection.subscribe!(change => changes.push(change));

    await Query(where => void where(User, { name: "A" }));
    await Query(where => {
      const user = where(User);
      where(user).update({ name: "B" });
    });
    await Query(where => {
      where(where(User)).delete();
    });

    expect(changes).toEqual([
      { table: "user", op: "insert", id: 1, row: { id: 1, name: "A" } },
      { table: "user", op: "update", id: 1, row: { name: "B" } },
      { table: "user", op: "delete", id: 1 }
    ]);
  })
})

describe("transaction", () => {
  it("will commit writes and report them after", async () => {
    const db = memory();
    const changes: unknown[] = [];

    db.subscribe!(change => changes.push(change));

    const result = await db.transaction(async () => {
      await db.insert("user", { name: "A" });
      await db.update("user", 1, { name: "B" });

      expect(changes).toEqual([]);

      return "done";
    });

    expect(result).toBe("done");
    expect(changes).toEqual([
      { table: "user", op: "insert", id: 1, row: { id: 1, name: "A" } },
      { table: "user", op: "update", id: 1, row: { name: "B" } }
    ]);
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "B" }]);
  })

  it("will roll back rows and ids", async () => {
    const db = memory();
    const changes: unknown[] = [];

    class Post extends Type {
      static connection = db;
      title = str();
    }

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });

    db.subscribe!(change => changes.push(change));

    const failed = db.transaction(async () => {
      await db.insert("user", { name: "C" });
      await db.insert("post", { title: "D" });
      await db.update("user", 1, { name: "changed" });
      await db.remove("user", 2);
      await Query(where => {
        where(where(Post)).delete();
      });

      throw new Error("nope");
    });

    await expect(failed).rejects.toThrow("nope");
    expect(changes).toEqual([]);
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
    await expect(db.select("post", [])).resolves.toEqual([]);
    await expect(db.insert("user", { name: "E" }, true)).resolves.toEqual({ id: 3, name: "E" });
  })

  it("will join an outer transaction", async () => {
    const db = memory();

    await expect(db.transaction(async () => {
      await db.insert("user", { name: "outer" });
      await db.transaction(() => db.insert("user", { name: "inner" }));
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(db.select("user", [])).resolves.toEqual([]);
  })

  it("will hold other statements until it ends", async () => {
    const db = memory();
    const order: string[] = [];
    let finish!: () => void;
    const held = new Promise<void>(resolve => finish = resolve);

    const failed = db.transaction(async () => {
      await db.insert("user", { name: "inside" });
      await held;
      order.push("rollback");
      throw new Error("nope");
    });

    await new Promise(resolve => setTimeout(resolve));

    const outside = db.insert("user", { name: "outside" }).then(() => order.push("outside"));

    await new Promise(resolve => setTimeout(resolve));
    finish();

    await expect(failed).rejects.toThrow("nope");
    await outside;

    expect(order).toEqual(["rollback", "outside"]);
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "outside" }]);
  })

  it("will run transactions one at a time", async () => {
    const db = memory();
    const order: string[] = [];

    const run = (name: string) => db.transaction(async () => {
      order.push(`${name} start`);
      await new Promise(resolve => setTimeout(resolve));
      await db.insert("user", { name });
      order.push(`${name} end`);
    });

    await Promise.all([run("a"), run("b")]);

    expect(order).toEqual(["a start", "a end", "b start", "b end"]);
  })

  it("will restore an entity rolled back", async () => {
    const db = memory();

    class Note extends Type {
      static connection = db;
      text = str();
    }

    const note = await Note.new({ text: "A" });

    await expect(db.transaction(async () => {
      await note.set({ text: "B" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    expect(note.text).toBe("A");
    await expect(db.select("note", [])).resolves.toEqual([{ id: 1, text: "A" }]);
  })
})
