import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { str } from './fields';
import { Memory, memory } from './memory';
import { Builder } from './query/Builder';
import { Query } from './query/Query';
import { Type } from './Type';

describe("Memory", () => {
  it("will bind types", async () => {
    class User extends Type {
      name = str();
    }

    const db = Memory.new([User]);
    const user = await User.new({ name: "A" });

    expect(User.connection).toBe(db);
    await expect(db.select("user", [])).resolves.toEqual([{ id: user.id, name: "A" }]);

    await db.close();
  })

  it("will create from deprecated memory()", async () => {
    const db = memory();

    expect(db).toBeInstanceOf(Memory);
  })
})

describe("clear", () => {
  it("will delete rows and restart ids", async () => {
    const db = Memory.new();

    await db.insert("user", { name: "A" });
    await db.insert("post", { title: "B" });
    await db.clear();

    await expect(db.select("user", [])).resolves.toEqual([]);
    await expect(db.select("post", [])).resolves.toEqual([]);
    await expect(db.insert("user", { name: "C" }, true)).resolves.toEqual({ id: 1, name: "C" });
  })

  it("will destroy loaded entities", async () => {
    class User extends Type {
      name = str();
    }

    const db = Memory.new([User]);
    const user = await User.new({ name: "A" });

    await db.clear();
    await vi.waitFor(() => expect(user.get(null)).toBe(true));

    await db.close();
  })

  it("will notify each delete", async () => {
    const db = Memory.new();
    const changes: unknown[] = [];

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });

    db.subscribe(change => changes.push(change));
    await db.clear();

    expect(changes).toEqual([
      { table: "user", op: "delete", id: 1 },
      { table: "user", op: "delete", id: 2 }
    ]);
  })

  it("will restore on rollback", async () => {
    const db = Memory.new();

    await db.insert("user", { name: "A" });

    await expect(db.transaction(async () => {
      await db.clear();
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
    await expect(db.insert("user", {}, true)).resolves.toEqual({ id: 2 });
  })
})

describe("insert", () => {
  it("will assign incrementing ids", async () => {
    const db = Memory.new();

    await expect(db.insert("user", { name: "A" }, true)).resolves.toEqual({ id: 1, name: "A" });
    await expect(db.insert("user", { name: "B" }, true)).resolves.toEqual({ id: 2, name: "B" });
  })

  it("will not return row unless asked", async () => {
    const db = Memory.new();

    await expect(db.insert("user", { name: "A" })).resolves.toBeUndefined();
    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })

  it("will continue after explicit id", async () => {
    const db = Memory.new();

    await db.insert("user", { id: 5 });
    await db.insert("user", { id: 2 });

    await expect(db.insert("user", {}, true)).resolves.toEqual({ id: 6 });
  })

  it("will not share rows", async () => {
    const db = Memory.new();
    const row = (await db.insert("user", { name: "A" }, true))!;

    row.name = "B";

    const [got] = await db.select("user", []);

    got.name = "C";

    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })
})

describe("select", () => {
  const db = Memory.new();
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
    const db = Memory.new();

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
    const db = Memory.new();

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });
    await db.remove("user", 1);

    await expect(db.select("user", [])).resolves.toEqual([{ id: 2, name: "B" }]);
  })
})

describe("prepare", () => {
  class User extends Type {
    static table = "user";
    static connection = Memory.new();
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
    static connection = Memory.new();
    name = str();
  }

  it("will report writes", async () => {
    const db = Memory.new();
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
    const db = Memory.new();
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
    const db = Memory.new();
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
    const db = Memory.new();

    await expect(db.transaction(async () => {
      await db.insert("user", { name: "outer" });
      await db.transaction(() => db.insert("user", { name: "inner" }));
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await expect(db.select("user", [])).resolves.toEqual([]);
  })

  it("will hold other statements until it ends", async () => {
    const db = Memory.new();
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
    const db = Memory.new();
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
    const db = Memory.new();

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

function adapter(tables?: Memory.Snapshot) {
  const saved: Memory.Snapshot[] = [];
  const persist: Memory.Adapter = {
    load: () => tables,
    save: vi.fn((changes: Memory.Snapshot) => {
      saved.push(changes);
    })
  };

  return { persist, saved };
}

describe("persist", () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  })

  afterEach(() => {
    error.mockRestore();
  })

  it("will load tables and continue ids", async () => {
    const { persist } = adapter({ user: { rows: [{ id: 3, name: "A" }], next: 7 } });
    const db = Memory.new([], persist);

    await expect(db.insert("user", { name: "B" }, true)).resolves.toEqual({ id: 7, name: "B" });
    await expect(db.select("user", [])).resolves.toEqual([
      { id: 3, name: "A" },
      { id: 7, name: "B" }
    ]);
  })

  it("will wait for load", async () => {
    let finish!: (tables: Memory.Snapshot) => void;
    const db = Memory.new([], {
      load: () => new Promise(resolve => finish = resolve),
      save: () => {}
    });

    const rows = db.select("user", []);

    finish({ user: { rows: [{ id: 1 }], next: 2 } });

    await expect(rows).resolves.toEqual([{ id: 1 }]);
  })

  it("will save a clear", async () => {
    const { persist, saved } = adapter({ user: { rows: [{ id: 1, name: "A" }], next: 2 } });
    const db = Memory.new([], persist);

    await db.clear();
    await db.close();

    expect(saved).toEqual([{ user: { rows: [], next: 1 } }]);
  })

  it("will start empty", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await expect(db.select("user", [])).resolves.toEqual([]);
    await db.close();

    expect(saved).toEqual([]);
  })

  it("will save writes of a tick together", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await db.insert("user", { name: "A" });
    await db.insert("post", { title: "B" });
    await db.update("user", 1, { name: "C" });
    await db.close();

    expect(saved).toEqual([{
      user: { rows: [{ id: 1, name: "C" }], next: 2 },
      post: { rows: [{ id: 1, title: "B" }], next: 2 }
    }]);
  })

  it("will save every kind of write", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await db.insert("user", { name: "A" });
    await db.insert("user", { name: "B" });
    await db.update("user", 1, { name: "C" });
    await db.remove("user", 2);
    await db.insert("user", { id: 1, name: "D" }, false, { on: ["id"], update: ["name"] });
    await db.close();

    expect(saved).toEqual([{ user: { rows: [{ id: 1, name: "D" }], next: 3 } }]);
  })

  it("will save writes made while saving", async () => {
    let release!: () => void;
    const saved: Memory.Snapshot[] = [];
    const db = Memory.new([], {
      load: () => undefined,
      save: changes => {
        saved.push(changes);

        if (saved.length == 1)
          return new Promise<void>(resolve => release = resolve);
      }
    });

    await db.insert("user", { name: "A" });
    await vi.waitFor(() => expect(release).toBeDefined());
    await db.insert("user", { name: "B" });

    release();
    await db.close();

    expect(saved).toEqual([
      { user: { rows: [{ id: 1, name: "A" }], next: 2 } },
      { user: { rows: [{ id: 1, name: "A" }, { id: 2, name: "B" }], next: 3 } }
    ]);
  })

  it("will not share rows with adapter", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await db.insert("user", { name: "A" });
    await db.close();

    saved[0].user.rows[0].name = "B";

    await expect(db.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
  })

  it("will retry a failed save on close", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);

    const db = Memory.new([], { load: () => undefined, save });

    await db.insert("user", { name: "A" });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(new Error("disk full")));
    await db.close();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ user: { rows: [{ id: 1, name: "A" }], next: 2 } });
  })

  it("will not share loaded rows with adapter", async () => {
    const tables = { user: { rows: [{ id: 1, name: "A" }], next: 2 } };
    const db = Memory.new([], { load: () => tables, save: () => {} });

    await db.update("user", 1, { name: "B" });
    await db.close();

    expect(tables.user.rows).toEqual([{ id: 1, name: "A" }]);
  })

  it("will throw on close if save fails", async () => {
    const db = Memory.new([], {
      load: () => undefined,
      save: () => Promise.reject(new Error("disk full"))
    });

    await db.insert("user", { name: "A" });
    await expect(db.close()).rejects.toThrow("disk full");

    expect(db.get(null)).toBe(true);
  })

  it("will throw if load fails", async () => {
    const db = Memory.new([], {
      load: () => Promise.reject(new Error("corrupt")),
      save: () => {}
    });

    await expect(db.select("user", [])).rejects.toThrow("corrupt");
    await expect(db.transaction(() => {})).rejects.toThrow("corrupt");
  })

  it("will close after a failed load", async () => {
    const save = vi.fn();
    const db = Memory.new([], { load: () => Promise.reject(new Error("corrupt")), save });

    await expect(db.close()).resolves.toBeUndefined();

    expect(db.get(null)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  })

  it("will save writes by query", async () => {
    const { persist, saved } = adapter({ user: { rows: [{ id: 1, name: "A" }], next: 2 } });

    class User extends Type {
      static table = "user";
      name = str();
    }

    Memory.new([User], persist);

    await Query(where => {
      const user = where(User);
      where(user).update({ name: "B" });
    });

    await User.connection.close();

    expect(saved).toEqual([{ user: { rows: [{ id: 1, name: "B" }], next: 2 } }]);
  })

  it("will save once per commit", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await db.transaction(async () => {
      await db.insert("user", { name: "A" });
      await new Promise(resolve => setTimeout(resolve, 5));
      await db.insert("user", { name: "B" });
      await new Promise(resolve => setTimeout(resolve, 5));

      expect(saved).toEqual([]);
    });

    await db.close();

    expect(saved).toEqual([{
      user: { rows: [{ id: 1, name: "A" }, { id: 2, name: "B" }], next: 3 }
    }]);
  })

  it("will not save a transaction still open", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);
    let resume!: () => void;

    await db.insert("user", { name: "A" });

    const open = db.transaction(async () => {
      await db.insert("user", { name: "B" });
      await new Promise<void>(resolve => resume = resolve);
    });

    await vi.waitFor(() => expect(resume).toBeDefined());
    await new Promise(resolve => setTimeout(resolve, 5));

    expect(saved).toEqual([]);

    resume();
    await open;
    await db.close();

    expect(saved).toEqual([
      { user: { rows: [{ id: 1, name: "A" }, { id: 2, name: "B" }], next: 3 } }
    ]);
  })

  it("will not save a rolled back state", async () => {
    const { persist, saved } = adapter({ user: { rows: [{ id: 1, name: "A" }], next: 2 } });
    const db = Memory.new([], persist);

    await db.insert("post", { title: "X" });

    await expect(db.transaction(async () => {
      await db.update("user", 1, { name: "B" });
      await db.insert("user", { name: "C" });
      await db.insert("post", { title: "Y" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await db.close();

    expect(saved).toEqual([{ post: { rows: [{ id: 1, title: "X" }], next: 2 } }]);
  })

  it("will close after an open transaction ends", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);
    let resume!: () => void;

    const open = db.transaction(async () => {
      await db.insert("user", { name: "A" });
      await new Promise<void>(resolve => resume = resolve);
    });

    await vi.waitFor(() => expect(resume).toBeDefined());

    const closed = db.close();

    await new Promise(resolve => setTimeout(resolve, 5));
    expect(saved).toEqual([]);

    resume();
    await open;
    await closed;

    expect(saved).toEqual([{ user: { rows: [{ id: 1, name: "A" }], next: 2 } }]);
  })

  it("will throw if closed inside its own transaction", async () => {
    const { persist, saved } = adapter();
    const db = Memory.new([], persist);

    await expect(db.transaction(async () => {
      await db.insert("user", { name: "A" });
      await db.close();
    })).rejects.toThrow("Cannot close a connection inside its own transaction.");

    await db.close();

    expect(saved).toEqual([]);
  })
})
