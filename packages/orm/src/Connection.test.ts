import { describe, expect, it, vi } from 'vitest';

import { Connection } from './Connection';
import { Field } from './Field';
import { bool, date, json, num, str } from './fields';
import { Builder } from './query/Builder';
import { one } from './one';
import { isLike } from './where';
import { Memory } from './memory';
import { Type } from './Type';

class Store extends Connection {
  _db = Memory.new();

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
}

describe("using", () => {
  it("will be a Model", () => {
    const db = Store.new();
    const didUpdate = vi.fn();

    db.get(didUpdate);

    expect(db.using).toEqual(new Set());
    expect(didUpdate).toHaveBeenCalledTimes(1);
  })

  it("will bind types", () => {
    class Foo extends Type {}

    const db = Store.new([Foo]);

    expect(Foo.connection).toBe(db);
    expect(db.using).toEqual(new Set([Foo]));
  })

  it("will bind types by key", () => {
    class Foo extends Type {}

    const db = Store.new({ Foo });

    expect(Foo.connection).toBe(db);
  })

  it("will throw if type already has a connection", () => {
    class Foo extends Type {}

    Store.new([Foo]);

    expect(() => Store.new([Foo])).toThrow("Type Foo already has assigned connection.");
  })

  it("will unbind types on close", async () => {
    class Foo extends Type {}

    const db = Store.new([Foo]);

    await db.close();

    expect(db.get(null)).toBe(true);
    expect(Foo.connection).not.toBe(db);
    expect(() => Store.new([Foo])).not.toThrow();
  })

  it("will not unbind a type bound elsewhere", async () => {
    class Foo extends Type {}

    const db = Store.new([Foo]);
    const other = Memory.new();

    Foo.connection = other;
    db.set(null);

    expect(Foo.connection).toBe(other);
  })
})

describe("detached", () => {
  it("will default to one detached connection", async () => {
    class Foo extends Type {}
    class Bar extends Type {}

    await Memory.new().close();

    expect(Foo.connection).toBe(Bar.connection);
    expect(Foo.loaded.size).toBe(0);
    await expect(Foo.connection.select("foo", [])).rejects.toThrow("No database connection.");
    await expect(Foo.connection.insert("foo", {})).rejects.toThrow("No database connection.");
    await expect(Foo.connection.update("foo", 1, {})).rejects.toThrow("No database connection.");
    await expect(Foo.connection.remove("foo", 1)).rejects.toThrow("No database connection.");
  })
})

describe("ambient", () => {
  it("will bind a type to the latest connection", () => {
    class Foo extends Type {}

    Store.new();
    const db = Store.new();

    expect(Foo.connection).toBe(db);
    expect(db.using).toEqual(new Set([Foo]));
  })

  it("will not bind the base Type", () => {
    const db = Store.new();

    expect(Type.connection).not.toBe(db);
    expect(db.using).toEqual(new Set());
  })

  it("will keep a bound type where it is", () => {
    class Foo extends Type {}

    const db = Store.new([Foo]);

    Store.new();

    expect(Foo.connection).toBe(db);
  })

  it("will stay with the connection it joined", () => {
    class Foo extends Type {}

    const db = Store.new();

    expect(Foo.connection).toBe(db);

    Store.new();

    expect(Foo.connection).toBe(db);
  })

  it("will not bind to a closed connection", async () => {
    class Foo extends Type {}

    const open = Store.new();
    const db = Store.new();

    expect(Foo.connection).toBe(db);

    await db.close();

    expect(Foo.hasOwnProperty("connection")).toBe(false);
    expect(Foo.connection).not.toBe(open);
    await expect(Foo.query()).rejects.toThrow("No database connection.");
  })

  it("will bind to a connection made after none", async () => {
    class Foo extends Type {}

    await Store.new().close();
    await expect(Foo.query()).rejects.toThrow("No database connection.");

    const db = Store.new();

    expect(Foo.connection).toBe(db);
  })

  it("will sync a type that joined before await", async () => {
    class Foo extends Type {}

    const db = Store.new();
    const sync = db.sync = vi.fn(async () => {
      expect(db.using).toEqual(new Set([Foo]));
      db.set({ ready: true });
    });

    expect(Foo.connection).toBe(db);

    await db;

    expect(sync).toHaveBeenCalledTimes(1);
  })

  it("will refuse a type it can't store", () => {
    class Flag extends Type {
      on = bool();
    }

    class Coded extends Store {
      protected get codecs(){
        const codec: Connection.Codec = {
          types: ["text", "integer"],
          datatype: ({ type }: Field) => type,
          encode: (_field, value) => value,
          decode: (_field, value) => value
        };

        return new Map<Function, Connection.Codec>([[str, codec], [num, codec]]);
      }
    }

    Coded.new();

    expect(() => Flag.connection).toThrow("Coded can't store bool type 'boolean' (Flag.on).");
    expect(Flag.hasOwnProperty("connection")).toBe(false);
  })
})

describe("then", () => {
  it("will resolve without sync", async () => {
    const db = Memory.new();

    await expect(db).resolves.toBe(db);
    expect(db.then).toBeUndefined();
  })

  it("will sync when awaited", async () => {
    const db = Store.new();
    const sync = db.sync = vi.fn(async () => {
      db.set({ ready: true });
    });

    await db;
    await db;

    expect(sync).toHaveBeenCalledTimes(1);
    expect(db.ready).toBe(true);
  })

  it("will sync once for concurrent awaits", async () => {
    const db = Store.new();
    const sync = db.sync = vi.fn(async () => {
      await Promise.resolve();
      db.set({ ready: true });
    });

    await Promise.all([db.then(), db.then()]);

    expect(sync).toHaveBeenCalledTimes(1);
  })

  it("will resolve when sync returns the connection", async () => {
    const db = Store.new();

    db.sync = async () => {
      await Promise.resolve();
      db.set({ ready: true });
      return db;
    };

    await expect(db.then()).resolves.toBeUndefined();
  })

  it("will not sync when ready", async () => {
    const db = Store.new();
    const sync = db.sync = vi.fn(async () => {});

    db.set({ ready: true });
    await db.then();

    expect(sync).not.toHaveBeenCalled();
  })

  it("will collect instead of sync for a tool", async () => {
    const key = Symbol.for("@expressive/orm.collect");
    const found = new Set();
    const db = Store.new();
    const sync = db.sync = vi.fn(async () => {});

    Object.assign(globalThis, { [key]: found });

    try {
      await db;
    }
    finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }

    expect(sync).not.toHaveBeenCalled();
    expect(found).toEqual(new Set([db]));
  })

  it("will reject when sync fails", async () => {
    const db = Store.new();
    const failed = vi.fn();

    db.sync = () => Promise.reject(new Error("nope"));
    await db.then(undefined, failed);

    expect(failed).toHaveBeenCalledWith(new Error("nope"));
  })
})

describe("codecs", () => {
  const upper: Connection.Codec = {
    types: ["text", "varchar"],
    datatype: ({ type, length }: Field) => length ? `${type}(${length})` : type,
    encode: (_field, value) => String(value).toUpperCase(),
    decode: (_field, value) => String(value).toLowerCase()
  };

  const count: Connection.Codec = {
    types: ["integer"],
    datatype: () => "int",
    encode: (_field, value) => `#${value}`,
    decode: (_field, value) => Number(String(value).slice(1))
  };

  class Coded extends Store {
    protected get codecs(){
      return new Map<Function, Connection.Codec>([[str, upper], [num, count]]);
    }
  }

  it("will pass values through without codecs", () => {
    const db = Store.new();
    const field = new Field("name", { type: "text" });

    expect(db._encode(field, "a")).toBe("a");
    expect(db._decode(field, "a")).toBe("a");
    expect(db._datatype(field)).toBe("text");
  })

  it("will store a field by its helper's codec", () => {
    class User extends Type {
      name = str({ type: "varchar", length: 8 });
    }

    const db = Coded.new([User]);
    const name = User.fields.get("name")!;

    expect(db._encode(name, "ann")).toBe("ANN");
    expect(db._decode(name, "ANN")).toBe("ann");
    expect(db._datatype(name)).toBe("varchar(8)");
    expect(db._encode(name, null)).toBeNull();
    expect(db._decode(name, undefined)).toBeUndefined();
  })

  it("will store a relation by its key's codec", () => {
    class User extends Type {}

    class Post extends Type {
      author = one(User);
    }

    const db = Coded.new([User, Post]);
    const author = Post.fields.get("author")!;

    expect(db._encode(author, 3)).toBe("#3");
    expect(db._decode(author, "#3")).toBe(3);
    expect(db._datatype(author)).toBe("int");
  })

  it("will refuse to bind a type it can't store", () => {
    class User extends Type {
      name = str();
      seen = date();
    }

    class Flag extends Type {
      on = bool();
    }

    expect(() => Coded.new([Flag, User])).toThrow("Coded can't store bool type 'boolean' (Flag.on).");
    expect(Flag.hasOwnProperty("connection")).toBe(false);
    expect(User.hasOwnProperty("connection")).toBe(false);
  })

  it("will refuse a datatype its codec lacks", () => {
    class Doc extends Type {
      body = str({ type: "uuid" });
    }

    expect(() => Coded.new([Doc])).toThrow("Coded can't store str type 'uuid' (Doc.body).");
  })

  it("will refuse a field without a helper", () => {
    const db = Coded.new();

    expect(() => db._encode(new Field("raw"), 1)).toThrow("Coded can't store a field of type '' (undefined.raw).");
  })

  it("will check and encode in a Builder", () => {
    class User extends Type {
      name = str();
    }

    Coded.new([User]);

    const builder = new Builder();
    const table = builder.use(User) as Record<string, Field>;

    expect(builder.encode(table.name, "ann")).toBe("ANN");
    expect(builder.decode(table.name, "ANN")).toBe("ann");
    expect(() => builder.encode(table.name, 3)).toThrow("Value must be a string.");
  })

  it("will check without a connection in a Builder", () => {
    const builder = new Builder();
    const field = new Field("data", { set: (value: unknown) => [value], get: (value: unknown) => `${value}!` });

    expect(builder.encode(field, 1)).toEqual([1]);
    expect(builder.decode(field, "a")).toBe("a!");
    expect(builder.decode(field, null)).toBe("undefined!");
  })

  it("will keep plain values in memory", async () => {
    class Event extends Type {
      static connection = Memory.new();
      at = date();
      data = json<{ tags: string[] }>();
    }

    const at = new Date("2024-06-01T12:00:00.000Z");
    const data = { tags: ["a"] };

    await Event.insert({ at, data });
    data.tags.push("b");

    const [row] = await Event.query({ at });

    expect(row).toEqual({ id: 1, at, data: { tags: ["a"] } });
    expect(await Event.count({ at: isLike("2024-06%") })).toBe(1);
  })
})

describe("identity map", () => {
  class User extends Type {
    name = str();
  }

  it("will be owned by the connection", async () => {
    const db = Store.new([User]);
    const user = await User.new({ name: "Gabe" });

    expect(db._loaded.get(User)!.get(user.id)).toBe(user);

    await db.close();
  })

  it("will destroy entities with the connection", async () => {
    const db = Store.new([User]);
    const user = await User.new({ name: "Gabe" });
    const destroyed = vi.fn();

    user.get(null, destroyed);
    db.set(null);

    expect(destroyed).toHaveBeenCalled();
    expect(db._loaded.size).toBe(0);
  })
})

describe("transaction", () => {
  it("will throw without driver support", async () => {
    const db = Store.new();

    await expect(db.transaction(() => {})).rejects.toThrow("Store does not support transactions.");
  })

  it("will throw without AsyncLocalStorage", async () => {
    vi.resetModules();
    vi.spyOn(process, "getBuiltinModule" as any).mockReturnValue(undefined);

    try {
      const { Memory } = await import('./memory');
      const db = Memory.new();

      await expect(db.transaction(() => {})).rejects.toThrow("Transactions need AsyncLocalStorage from process.getBuiltinModule, which this runtime does not provide.");
    }
    finally {
      vi.restoreAllMocks();
      vi.resetModules();
    }
  })
})

describe("after", () => {
  function setup(){
    const db = Memory.new();

    class Upload extends Type {
      static connection = db;
      path = str();
    }

    return { db, Upload };
  }

  async function seed(Upload: ReturnType<typeof setup>["Upload"], ...paths: string[]){
    for (const path of paths)
      await Upload.insert({ path });
  }

  it("will run after instance delete", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, { delete: didDelete });

    const upload = await Upload.get(1);

    await upload.delete();

    expect(didDelete).toHaveBeenCalledTimes(1);
    expect(didDelete).toHaveBeenCalledWith({ id: 1, path: "a.png" });
  })

  it("will run after static delete by id", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png");
    db.after(Upload, { delete: didDelete });

    await Upload.delete(2);

    expect(didDelete).toHaveBeenCalledWith({ id: 2, path: "b.png" });
  })

  it("will run after remove called directly", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, { delete: didDelete });

    await db.remove("upload", 1);

    expect(didDelete).toHaveBeenCalledWith({ id: 1, path: "a.png" });
  })

  it("will not run or select for a delete by filter", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png", "c.txt");
    db.after(Upload, { delete: didDelete });

    void db.select;
    const select = vi.spyOn(db, "select");

    expect(await Upload.delete({ path: isLike("%.png") })).toBe(2);
    expect(didDelete).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  })

  it("will pass relations as ids", async () => {
    const db = Memory.new();
    const didDelete = vi.fn();

    class User extends Type {
      static connection = db;
      name = str();
    }

    class File extends Type {
      static connection = db;
      owner = one(User);
    }

    await User.insert({ name: "Gabe" });
    await File.insert({ owner: 1 });
    db.after(File, { delete: didDelete });

    await File.delete(1);

    expect(didDelete).toHaveBeenCalledWith({ id: 1, owner: 1 });
  })

  it("will await the handler", async () => {
    const { db, Upload } = setup();
    const done = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, {
      async delete(){
        await new Promise(resolve => setTimeout(resolve, 1));
        done();
      }
    });

    await Upload.delete(1);

    expect(done).toHaveBeenCalled();
  })

  it("will run every registration", async () => {
    const { db, Upload } = setup();
    const first = vi.fn();
    const second = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, { delete: first });
    db.after(Upload, { delete: second });
    db.after(Upload, {});

    await Upload.delete(1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  })

  it("will stop when removed", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png");

    const release = db.after(Upload, { delete: didDelete });

    expect(release()).toBe(true);

    void db.select;
    const select = vi.spyOn(db, "select");

    await Upload.delete(1);
    await Upload.delete({ path: "b.png" });

    expect(didDelete).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  })

  it("will not select without a hook", async () => {
    const { db, Upload } = setup();

    await seed(Upload, "a.png", "b.png");

    void db.select;
    const select = vi.spyOn(db, "select");

    await Upload.delete(1);
    await Upload.delete({ path: "b.png" });

    expect(select).not.toHaveBeenCalled();
  })

  it("will not run for a missing row", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    db.after(Upload, { delete: didDelete });

    await Upload.delete(1);

    expect(didDelete).not.toHaveBeenCalled();
  })

  it("will log and not reject when a handler throws", async () => {
    const { db, Upload } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    const thrown = new Error("nope");

    await seed(Upload, "a.png");
    db.after(Upload, { delete(){ throw thrown } });
    db.after(Upload, { delete: after });

    await expect(Upload.delete(1)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(thrown);
    expect(after).toHaveBeenCalled();
    expect(await Upload.count()).toBe(0);

    error.mockRestore();
  })

  it("will run after commit", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png");
    db.after(Upload, { delete: didDelete });

    await db.transaction(async () => {
      await Upload.delete(1);
      await (await Upload.get(2)).delete();
      expect(didDelete).not.toHaveBeenCalled();
    });

    expect(didDelete).toHaveBeenCalledTimes(2);
  })

  it("will not run after rollback", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, { delete: didDelete });

    await expect(db.transaction(async () => {
      await Upload.delete(1);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");

    expect(didDelete).not.toHaveBeenCalled();
    expect(await Upload.count()).toBe(1);
  })

  it("will use the connection after commit", async () => {
    const { db, Upload } = setup();

    await seed(Upload, "a.png", "a.png.thumb");
    db.after(Upload, {
      async delete({ path }){
        const [thumb] = await Upload.query({ path: `${path}.thumb` });
        await Upload.delete(thumb.id);
      }
    });

    await db.transaction(() => Upload.delete(1));

    expect(await Upload.count()).toBe(0);
  })

  it("will await handlers and not reject a transaction", async () => {
    const { db, Upload } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const done = vi.fn();

    await seed(Upload, "a.png");
    db.after(Upload, {
      async delete(){
        await new Promise(resolve => setTimeout(resolve, 1));
        done();
        throw new Error("nope");
      }
    });

    await expect(db.transaction(() => Upload.delete(1))).resolves.toBeUndefined();

    expect(done).toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(await Upload.count()).toBe(0);

    error.mockRestore();
  })

  it("will not run for another connection", async () => {
    const { db, Upload } = setup();
    const other = Memory.new();
    const didDelete = vi.fn();

    class Shared extends Type {
      static connection = other;
      static table = "upload";
      path = str();
    }

    await Shared.insert({ path: "a.png" });
    db.after(Upload, { delete: didDelete });

    await Shared.delete(1);

    expect(didDelete).not.toHaveBeenCalled();
  })
})

describe("before", () => {
  function setup(){
    const db = Memory.new();

    class Upload extends Type {
      static connection = db;
      path = str();
    }

    return { db, Upload };
  }

  it("will run before the row is removed", async () => {
    const { db, Upload } = setup();
    let count: number | undefined;

    await Upload.insert({ path: "a.png" });
    db.before(Upload, {
      async delete(row){
        expect(row).toEqual({ id: 1, path: "a.png" });
        count = await Upload.count();
      }
    });

    await Upload.delete(1);

    expect(count).toBe(1);
    expect(await Upload.count()).toBe(0);
  })

  it("will cancel an instance delete", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await Upload.insert({ path: "a.png" });
    db.before(Upload, { delete(){ throw new Error("locked") } });
    db.after(Upload, { delete: didDelete });

    const upload = await Upload.get(1);

    await expect(upload.delete()).rejects.toThrow("locked");

    expect(upload.get(null)).toBe(false);
    expect(didDelete).not.toHaveBeenCalled();
    expect(await Upload.count()).toBe(1);
  })

  it("will cancel a static delete", async () => {
    const { db, Upload } = setup();
    const later = vi.fn();

    await Upload.insert({ path: "a.png" });
    db.before(Upload, { async delete(){ throw new Error("locked") } });
    db.before(Upload, { delete: later });

    await expect(Upload.delete(1)).rejects.toThrow("locked");
    await expect(db.remove("upload", 1)).rejects.toThrow("locked");

    expect(later).not.toHaveBeenCalled();
    expect(await Upload.count()).toBe(1);
  })

  it("will run before after, in order", async () => {
    const { db, Upload } = setup();
    const calls: string[] = [];

    await Upload.insert({ path: "a.png" });
    db.after(Upload, { delete: () => { calls.push("after") } });
    db.before(Upload, { delete: () => { calls.push("before 1") } });
    db.before(Upload, {});
    db.before(Upload, { delete: () => { calls.push("before 2") } });

    await Upload.delete(1);

    expect(calls).toEqual(["before 1", "before 2", "after"]);
  })

  it("will not select for another table", async () => {
    const { db, Upload } = setup();

    class Note extends Type {
      static connection = db;
      text = str();
    }

    await Note.insert({ text: "hi" });
    db.before(Upload, { delete: vi.fn() });

    void db.select;
    const select = vi.spyOn(db, "select");

    await Note.delete(1);

    expect(select).not.toHaveBeenCalled();
    expect(await Note.count()).toBe(0);
  })

  it("will skip a missing row", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    db.before(Upload, { delete: didDelete });

    await Upload.delete(1);

    expect(didDelete).not.toHaveBeenCalled();
  })

  it("will stop when removed", async () => {
    const { db, Upload } = setup();
    const gate = vi.fn();
    const effect = vi.fn();

    await Upload.insert({ path: "a.png" });

    const stopBefore = db.before(Upload, { delete: gate });
    const stopAfter = db.after(Upload, { delete: effect });

    expect(stopBefore()).toBe(true);
    expect(stopAfter()).toBe(true);

    void db.select;
    const select = vi.spyOn(db, "select");

    await Upload.delete(1);

    expect(gate).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  })

  it("will not run for a delete by filter", async () => {
    const { db, Upload } = setup();
    const gate = vi.fn();

    await Upload.insert({ path: "a.png" });
    db.before(Upload, { delete: gate });

    await Upload.delete({ path: "a.png" });

    expect(gate).not.toHaveBeenCalled();
  })

  it("will roll back a transaction when it throws", async () => {
    const { db, Upload } = setup();
    const effect = vi.fn();

    await Upload.insert({ path: "a.png" });
    await Upload.insert({ path: "b.png" });
    db.before(Upload, {
      delete(row){
        if (row.path == "b.png")
          throw new Error("locked");
      }
    });
    db.after(Upload, { delete: effect });

    await expect(db.transaction(async () => {
      await Upload.delete(1);
      await Upload.delete(2);
    })).rejects.toThrow("locked");

    expect(effect).not.toHaveBeenCalled();
    expect(await Upload.count()).toBe(2);
  })

  it("will run inside the transaction", async () => {
    const { db, Upload } = setup();
    const calls: string[] = [];

    await Upload.insert({ path: "a.png" });
    db.before(Upload, { delete: () => { calls.push("before") } });
    db.after(Upload, { delete: () => { calls.push("after") } });

    await db.transaction(async () => {
      await Upload.delete(1);
      calls.push("inside");
    });

    expect(calls).toEqual(["before", "inside", "after"]);
  })
})
