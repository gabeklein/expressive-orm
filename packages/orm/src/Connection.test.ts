import { describe, expect, it, vi } from 'vitest';

import { Connection } from './Connection';
import { str } from './fields';
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
