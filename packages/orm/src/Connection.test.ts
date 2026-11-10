import { describe, expect, it, vi } from 'vitest';

import { Connection } from './Connection';
import { str } from './fields';
import { one } from './one';
import { isLike } from './where';
import { memory } from './memory';
import { Type } from './Type';

class Store extends Connection {
  _db = memory();

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
    const other = memory();

    Foo.connection = other;
    db.set(null);

    expect(Foo.connection).toBe(other);
  })
})

describe("detached", () => {
  it("will default to one detached connection", async () => {
    class Foo extends Type {}
    class Bar extends Type {}

    expect(Foo.connection).toBe(Bar.connection);
    expect(Foo.loaded.size).toBe(0);
    await expect(Foo.connection.select("foo", [])).rejects.toThrow("No database connection.");
    await expect(Foo.connection.insert("foo", {})).rejects.toThrow("No database connection.");
    await expect(Foo.connection.update("foo", 1, {})).rejects.toThrow("No database connection.");
    await expect(Foo.connection.remove("foo", 1)).rejects.toThrow("No database connection.");
  })
})

describe("then", () => {
  it("will resolve without sync", async () => {
    const db = memory();

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
    vi.doMock("node:async_hooks", () => { throw new Error("Cannot find module 'node:async_hooks'") });

    const { memory } = await import('./memory');
    const db = memory();

    await expect(db.transaction(() => {})).rejects.toThrow("Transactions need AsyncLocalStorage, which this runtime does not provide.");

    vi.doUnmock("node:async_hooks");
    vi.resetModules();
  })
})

describe("on", () => {
  function setup(){
    const db = memory();

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
    db.on(Upload, { delete: didDelete });

    const upload = await Upload.get(1);

    await upload.delete();

    expect(didDelete).toHaveBeenCalledTimes(1);
    expect(didDelete).toHaveBeenCalledWith({ id: 1, path: "a.png" });
  })

  it("will run after static delete by id", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png");
    db.on(Upload, { delete: didDelete });

    await Upload.delete(2);

    expect(didDelete).toHaveBeenCalledWith({ id: 2, path: "b.png" });
  })

  it("will run after remove called directly", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png");
    db.on(Upload, { delete: didDelete });

    await db.remove("upload", 1);

    expect(didDelete).toHaveBeenCalledWith({ id: 1, path: "a.png" });
  })

  it("will not run or select for a delete by filter", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png", "c.txt");
    db.on(Upload, { delete: didDelete });

    void db.select;
    const select = vi.spyOn(db, "select");

    expect(await Upload.delete({ path: isLike("%.png") })).toBe(2);
    expect(didDelete).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  })

  it("will pass relations as ids", async () => {
    const db = memory();
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
    db.on(File, { delete: didDelete });

    await File.delete(1);

    expect(didDelete).toHaveBeenCalledWith({ id: 1, owner: 1 });
  })

  it("will await the handler", async () => {
    const { db, Upload } = setup();
    const done = vi.fn();

    await seed(Upload, "a.png");
    db.on(Upload, {
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
    db.on(Upload, { delete: first });
    db.on(Upload, { delete: second });
    db.on(Upload, {});

    await Upload.delete(1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  })

  it("will stop when removed", async () => {
    const { db, Upload } = setup();
    const didDelete = vi.fn();

    await seed(Upload, "a.png", "b.png");

    const release = db.on(Upload, { delete: didDelete });

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

    db.on(Upload, { delete: didDelete });

    await Upload.delete(1);

    expect(didDelete).not.toHaveBeenCalled();
  })

  it("will log and not reject when a handler throws", async () => {
    const { db, Upload } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    const thrown = new Error("nope");

    await seed(Upload, "a.png");
    db.on(Upload, { delete(){ throw thrown } });
    db.on(Upload, { delete: after });

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
    db.on(Upload, { delete: didDelete });

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
    db.on(Upload, { delete: didDelete });

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
    db.on(Upload, {
      async delete({ path }){
        const [thumb] = await Upload.find({ path: `${path}.thumb` });
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
    db.on(Upload, {
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
    const other = memory();
    const didDelete = vi.fn();

    class Shared extends Type {
      static connection = other;
      static table = "upload";
      path = str();
    }

    await Shared.insert({ path: "a.png" });
    db.on(Upload, { delete: didDelete });

    await Shared.delete(1);

    expect(didDelete).not.toHaveBeenCalled();
  })
})
