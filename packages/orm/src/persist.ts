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

function browser(name: string): memory.Adapter {
  let database: Promise<Database> | undefined;

  function open() {
    return database ||= new Promise<Database>((resolve, reject) => {
      const factory = (globalThis as unknown as { indexedDB: Factory }).indexedDB;
      const req = factory.open(name, 1);

      req.onupgradeneeded = () => req.result.createObjectStore("tables");
      request(req).then(resolve, reject);
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

function fs(name: string): Promise<typeof import('node:fs/promises')> {
  return import(name);
}

function disk(path: string): memory.Adapter {
  let data: memory.Snapshot = {};

  return {
    async load() {
      const { readFile } = await fs("node:fs/promises");

      try {
        return data = JSON.parse(await readFile(path, "utf8"));
      }
      catch (error) {
        if ((error as { code?: string }).code === "ENOENT")
          return;

        throw error;
      }
    },
    async save(changes) {
      const { writeFile, rename } = await fs("node:fs/promises");
      const temp = `${path}.tmp`;

      Object.assign(data, changes);
      await writeFile(temp, JSON.stringify(data));
      await rename(temp, path);
    }
  };
}

export { browser, disk };
