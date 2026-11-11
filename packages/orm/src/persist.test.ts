import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memory } from './memory';

describe("indexedDB", () => {
  let factory: InstanceType<typeof IDBFactory>;

  beforeEach(() => {
    vi.stubGlobal("indexedDB", factory = new IDBFactory());
  })

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  })

  it("will survive a reload", async () => {
    const first = memory({ persist: memory.indexedDB("app") });

    await first.insert("user", { name: "A" });
    await first.insert("post", { title: "B" });
    await first.remove("post", 1);
    await first.close();

    const second = memory({ persist: memory.indexedDB("app") });

    await expect(second.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
    await expect(second.select("post", [])).resolves.toEqual([]);
    await expect(second.insert("post", {}, true)).resolves.toEqual({ id: 2 });
    await second.close();
  })

  it("will keep tables apart by name", async () => {
    const first = memory({ persist: memory.indexedDB("one") });

    await first.insert("user", { name: "A" });
    await first.close();

    const second = memory({ persist: memory.indexedDB("two") });

    await expect(second.select("user", [])).resolves.toEqual([]);
  })

  it("will throw if database cannot open", async () => {
    await new Promise<void>((resolve) => {
      const req = factory.open("app", 2);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });

    const db = memory({ persist: memory.indexedDB("app") });

    await expect(db.select("user", [])).rejects.toThrow();
  })

  it("will give the database up to a delete", async () => {
    const db = memory({ persist: memory.indexedDB("app") });

    await db.insert("user", { name: "A" });
    await db.close();

    await new Promise<void>((resolve, reject) => {
      const req = factory.deleteDatabase("app");
      req.onsuccess = () => resolve();
      req.onblocked = () => reject(new Error("blocked"));
    });

    const next = memory({ persist: memory.indexedDB("app") });

    await expect(next.select("user", [])).resolves.toEqual([]);
    await next.close();
  })

  it("will reopen after giving the database up", async () => {
    const persist = memory.indexedDB("app");
    const table = { rows: [{ id: 1 }], next: 2 };

    await persist.save({ user: table });
    await new Promise<void>((resolve, reject) => {
      const req = factory.deleteDatabase("app");
      req.onsuccess = () => resolve();
      req.onblocked = () => reject(new Error("blocked"));
    });
    await persist.save({ post: table });

    await expect(persist.load()).resolves.toEqual({ post: table });
  })

  it("will throw if save aborts", async () => {
    const db = memory({ persist: memory.indexedDB("app") });

    await db.select("user", []);

    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: InstanceType<typeof IDBObjectStore>) {
      this.transaction.abort();
      return {} as any;
    });

    vi.spyOn(console, "error").mockImplementation(() => {});

    await db.insert("user", { name: "A" });
    await expect(db.close()).rejects.toBeDefined();
  })
})

describe("file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "expressive-orm-"));
  })

  afterEach(async () => {
    await rm(dir, { recursive: true });
  })

  it("will survive a reload", async () => {
    const path = join(dir, "db.json");
    const first = memory({ persist: memory.file(path) });

    await first.insert("user", { name: "A" });
    await first.close();

    const second = memory({ persist: memory.file(path) });

    await expect(second.select("user", [])).resolves.toEqual([{ id: 1, name: "A" }]);
    await expect(second.insert("user", {}, true)).resolves.toEqual({ id: 2 });
    await second.close();
  })

  it("will keep tables it did not change", async () => {
    const path = join(dir, "db.json");
    const db = memory({ persist: memory.file(path) });

    await db.insert("user", { name: "A" });
    await db.close();

    const next = memory({ persist: memory.file(path) });

    await next.insert("post", { title: "B" });
    await next.close();

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      user: { rows: [{ id: 1, name: "A" }], next: 2 },
      post: { rows: [{ id: 1, title: "B" }], next: 2 }
    });
  })

  it("will not save rolled back rows", async () => {
    const path = join(dir, "db.json");

    await writeFile(path, JSON.stringify({ user: { rows: [{ id: 1, name: "A" }], next: 2 } }));

    const db = memory({ persist: memory.file(path) });

    await expect(db.transaction(async () => {
      await db.update("user", 1, { name: "B" });
      await db.insert("user", { name: "C" });
      throw new Error("nope");
    })).rejects.toThrow("nope");

    await db.insert("post", { title: "X" });
    await db.close();

    expect(JSON.parse(await readFile(path, "utf8")).user).toEqual({ rows: [{ id: 1, name: "A" }], next: 2 });
  })

  it("will keep dates", async () => {
    const path = join(dir, "db.json");
    const at = new Date("2020-01-01T00:00:00.000Z");
    const db = memory({ persist: memory.file(path) });

    await db.insert("event", { at, meta: { $date: 1 } });
    await db.close();

    const next = memory({ persist: memory.file(path) });

    await expect(next.select("event", [])).resolves.toEqual([{ id: 1, at, meta: { $date: 1 } }]);
    await next.close();
  })

  it("will write through a temporary file", async () => {
    const path = join(dir, "db.json");
    const db = memory({ persist: memory.file(path) });

    await db.insert("user", { name: "A" });
    await db.close();

    await expect(readdir(dir)).resolves.toEqual(["db.json"]);
  })

  it("will start empty without a file", async () => {
    const db = memory({ persist: memory.file(join(dir, "db.json")) });

    await expect(db.select("user", [])).resolves.toEqual([]);
  })

  it("will throw on unreadable file", async () => {
    const path = join(dir, "db.json");

    await writeFile(path, "{");

    const db = memory({ persist: memory.file(path) });

    await expect(db.select("user", [])).rejects.toThrow(SyntaxError);
  })

  it("will throw without node:fs", async () => {
    vi.spyOn(process, "getBuiltinModule" as any).mockReturnValue(undefined);

    try {
      const db = memory({ persist: memory.file(join(dir, "db.json")) });

      await expect(db.select("user", [])).rejects.toThrow("memory.file needs node:fs from process.getBuiltinModule, which this runtime does not provide.");
    }
    finally {
      vi.restoreAllMocks();
    }
  })
})
