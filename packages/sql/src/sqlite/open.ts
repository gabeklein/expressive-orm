import { createEngine, type Engine } from './engine';

export declare namespace sqlite {
  /** What `sqlite` applies once the file is open. */
  interface Options {
    /** Folder of `.sql` files - each not yet applied runs once, in name order, tracked by name in `_migrations`. */
    migrations?: string;
    /** A `.sql` file run after the migrations when the database had no tables. */
    seed?: string;
  }
}

/**
 * Open a SQLite file as an `Engine`, applying `migrations` and `seed` in one transaction.
 *
 * Opens through the built-in loader, with foreign keys on. Omit `file` for in memory. Paths resolve from the working directory.
 * The engine is the caller's - pass it to `db.session(fn, engine)` or as `{ source }`, and `close()` it when done.
 * A failed migration or seed rolls back, closes the file and rejects.
 *
 * @example
 * const engine = await sqlite("local.db", { migrations: "migrations", seed: "seed.sql" });
 * await engine.close();
 */
export async function sqlite(file = ":memory:", { migrations, seed }: sqlite.Options = {}): Promise<Engine> {
  const engine = await createEngine(file);

  if (!migrations && !seed)
    return engine;

  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tables } = await engine.get("SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table'");

  await engine.exec("BEGIN");

  try {
    if (migrations) {
      await engine.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");

      const done = new Set((await engine.all("SELECT name FROM _migrations")).map(row => row.name));
      const pending = (await readdir(migrations)).filter(name => name.endsWith(".sql") && !done.has(name)).sort();

      for (const name of pending) {
        await engine.exec(await readFile(join(migrations, name), "utf8"));
        await engine.run("INSERT INTO _migrations (name) VALUES (?)", [name]);
      }
    }

    if (seed && !tables)
      await engine.exec(await readFile(seed, "utf8"));

    await engine.exec("COMMIT");
  }
  catch (error) {
    await engine.exec("ROLLBACK");
    await engine.close();
    throw error;
  }

  return engine;
}
