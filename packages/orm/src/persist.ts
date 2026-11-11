import type { memory } from './memory';

type Request<T = any> = {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
};

type Store = {
  getAll(): Request<memory.Table[]>;
  getAllKeys(): Request<string[]>;
  put(value: memory.Table, key: string): void;
};

type Transaction = {
  error: unknown;
  objectStore(name: string): Store;
  oncomplete: (() => void) | null;
  onabort: (() => void) | null;
};

type Database = {
  transaction(store: string, mode?: string): Transaction;
  createObjectStore(name: string): void;
  onversionchange: (() => void) | null;
  close(): void;
};

type Factory = {
  open(name: string, version: number): Request<Database> & { onupgradeneeded: (() => void) | null };
};

function request<T>(request: Request<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists `memory()` in the browser's IndexedDB database `name`, one record per table.
 *
 * Gives the database up when another connection deletes or upgrades it, reopening on the next save.
 */
function indexedDBAdapter(name: string): memory.Adapter {
  let database: Promise<Database> | undefined;

  function open() {
    if (database)
      return database;

    const factory = (globalThis as unknown as { indexedDB: Factory }).indexedDB;
    const req = factory.open(name, 1);

    req.onupgradeneeded = () => req.result.createObjectStore("tables");

    return database = request(req).then(db => {
      db.onversionchange = () => {
        database = undefined;
        db.close();
      };

      return db;
    });
  }

  return {
    async load() {
      const store = (await open()).transaction("tables").objectStore("tables");
      const [keys, tables] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);

      return Object.fromEntries(keys.map((key, i) => [key, tables[i]]));
    },
    async save(changes) {
      const tx = (await open()).transaction("tables", "readwrite");
      const store = tx.objectStore("tables");

      for (const name in changes)
        store.put(changes[name], name);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    }
  };
}

function fs(): typeof import('node:fs/promises') {
  const fs = (globalThis as any).process?.getBuiltinModule?.("node:fs/promises");

  if (!fs)
    throw new Error("memory.file needs node:fs from process.getBuiltinModule, which this runtime does not provide.");

  return fs;
}

function replace(this: any, key: string, value: unknown) {
  const raw = this[key];

  return raw instanceof Date ? { $date: raw.toISOString() } : value;
}

function revive(_key: string, value: any) {
  return value && typeof value.$date === "string" && Object.keys(value).length === 1 ? new Date(value.$date) : value;
}

/**
 * Persists `memory()` to one JSON file, writing `path.tmp` and renaming it over.
 *
 * Needs `process.getBuiltinModule` - Bun, Node 20.16+ or 22.3+, Deno. The directory must exist.
 * Values round-trip as JSON, except `Date`, which is kept; a `BigInt` fails the save.
 */
function fileAdapter(path: string): memory.Adapter {
  let data: memory.Snapshot = {};

  return {
    async load() {
      const { readFile } = fs();

      try {
        return data = JSON.parse(await readFile(path, "utf8"), revive);
      }
      catch (error) {
        if ((error as { code?: string }).code === "ENOENT")
          return;

        throw error;
      }
    },
    async save(changes) {
      const { writeFile, rename } = fs();
      const temp = `${path}.tmp`;

      Object.assign(data, changes);
      await writeFile(temp, JSON.stringify(data, replace));
      await rename(temp, path);
    }
  };
}

export { fileAdapter, indexedDBAdapter };
