import { createEngine, type Engine } from './engine';

export declare namespace d1 {
  /** What `d1` applies when it opens the file. */
  interface Options {
    /** Folder of `.sql` files - each not yet applied runs once, in name order, tracked in `d1_migrations` as wrangler does. */
    migrations?: string;
    /** A `.sql` file run after the migrations when the database had no tables. */
    seed?: string;
  }

  /** A D1 binding's shape over a local file. */
  interface Binding {
    /** A statement to bind and run. */
    prepare(sql: string): Statement;
    /** Run statements atomically, resolving each one's result. */
    batch(statements: Statement[]): Promise<Result[]>;
    /** Run one or more statements without parameters. */
    exec(sql: string): Promise<{ count: number; duration: number }>;
  }

  /** A prepared statement - `bind` returns a new one with its parameters. */
  interface Statement {
    bind(...values: unknown[]): Statement;
    all<T = any>(): Promise<Result<T>>;
    run<T = any>(): Promise<Result<T>>;
    /** The first row, or `column` of it - `null` without one. */
    first<T = any>(column?: string): Promise<T | null>;
    /** Rows as arrays - the column names first with `columnNames`, when there are rows. */
    raw<T extends unknown[] = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
  }

  /** A statement's rows and what it changed. */
  interface Result<T = any> {
    success: true;
    results: T[];
    meta: { changes: number; last_row_id: number; duration: number };
  }
}

/**
 * Open a SQLite file as a D1 binding - for a Worker's `env.DB` outside workerd, in dev or tests.
 *
 * Opens on first use through the built-in loader, with foreign keys on, then applies `migrations` and `seed` in one transaction.
 * Omit `file` for in memory. Paths resolve from the working directory.
 * `prepare`, `bind`, `all`, `first`, `run`, `raw`, `batch` and `exec` behave as D1's - a `batch` is atomic, statements run one at a time.
 * Anything taking a D1 binding takes it - `SQLiteConnection`, `db.session(fn, binding)`, Better Auth.
 *
 * @example
 * const DB = d1("local.db", { migrations: "migrations", seed: "seed.sql" });
 * const users = await DB.prepare("SELECT * FROM user").all();
 */
export function d1(file = ":memory:", options: d1.Options = {}): d1.Binding {
  let queue: Promise<unknown> = Promise.resolve();
  let opened: Promise<Engine> | undefined;

  const open = () => opened ??= createEngine(file).then(async engine => {
    await prepare(engine, options);
    return engine;
  });

  const lock = <T>(fn: (engine: Engine) => Promise<T>): Promise<T> => {
    const next = queue.then(open).then(fn);
    queue = next.catch(() => {});
    return next;
  };

  const execute = async (engine: Engine, sql: string, params: unknown[]): Promise<d1.Result> => {
    const before = await engine.get("SELECT total_changes() AS total");
    const results = await engine.all(sql, params.map(bindable));
    const after = await engine.get("SELECT total_changes() AS total, last_insert_rowid() AS id");

    return {
      success: true,
      results,
      meta: { changes: after.total - before.total, last_row_id: after.id, duration: 0 }
    };
  };

  type Statement = d1.Statement & { sql: string; params: unknown[] };

  const statement = (sql: string, params: unknown[] = []): Statement => {
    const all = () => lock(engine => execute(engine, sql, params));

    return {
      sql,
      params,
      all,
      run: all,
      bind: (...values: unknown[]) => statement(sql, values),
      async first(column?: string) {
        const [row] = (await all()).results;
        return row === undefined ? null : column === undefined ? row : row[column];
      },
      async raw(options?: { columnNames?: boolean }) {
        const { results } = await all();
        const rows = results.map(row => Object.values(row));
        return options?.columnNames && results.length ? [Object.keys(results[0]), ...rows] : rows;
      }
    } as Statement;
  };

  return {
    prepare: sql => statement(sql),
    batch: statements => lock(engine => atomic(engine, async () => {
      const results: d1.Result[] = [];

      for (const { sql, params } of statements as Statement[])
        results.push(await execute(engine, sql, params));

      return results;
    })),
    exec: sql => lock(async engine => {
      await engine.exec(sql);
      return { count: sql.split(";").filter(part => part.trim()).length, duration: 0 };
    })
  } as d1.Binding;
}

function bindable(value: unknown){
  return typeof value == "boolean" ? Number(value) : value;
}

async function atomic<T>(engine: Engine, fn: () => Promise<T>): Promise<T> {
  await engine.exec("BEGIN");

  try {
    const result = await fn();
    await engine.exec("COMMIT");
    return result;
  }
  catch (error) {
    await engine.exec("ROLLBACK");
    throw error;
  }
}

async function prepare(engine: Engine, { migrations, seed }: d1.Options){
  if (!migrations && !seed)
    return;

  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tables } = await engine.get("SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'");

  await atomic(engine, async () => {
    if (migrations) {
      await engine.exec(
        "CREATE TABLE IF NOT EXISTS d1_migrations (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
      );

      const done = new Set((await engine.all("SELECT name FROM d1_migrations")).map(row => row.name));
      const pending = (await readdir(migrations)).filter(name => name.endsWith(".sql") && !done.has(name)).sort();

      for (const name of pending) {
        await engine.exec(await readFile(join(migrations, name), "utf8"));
        await engine.run("INSERT INTO d1_migrations (name) VALUES (?)", [name]);
      }
    }

    if (seed && !tables)
      await engine.exec(await readFile(seed, "utf8"));
  });
}
