import { Entities, Connection } from "..";

export function random(min: number, max: number) {
  const u = Math.max(min, max);
  const l = Math.min(min, max);
  const diff = u - l;
  const r = Math.floor(Math.random() * (diff + 1));
  return l + r;
}

const gc = new Set<Function>();

/**
 * Generates a new in-memory database specific to
 * a test and attaches the given entities to it.
 **/
export async function inMemoryDatabase(entities: Entities){
  const db = new Connection({
    client: "sqlite3",
    useNullAsDefault: true,
    connection: {
      filename: ":memory:"
    }
  });

  await db.attach(entities);
  gc.add(() => db.close());

  return db;
}

afterEach(async () => {
  await Promise.all(Array.from(gc).map(fn => {
    gc.delete(fn);
    return fn();
  }));
});