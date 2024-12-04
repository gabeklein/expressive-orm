import { Connection } from "../";

const reset = new Set<Function>();

/**
 * Generates a new in-memory database specific to
 * a test and attaches entities provided to it.
 **/
export async function inMemoryDatabase(entities: Connection.Types){
  const db = new Connection({
    client: "sqlite3",
    useNullAsDefault: true,
    connection: {
      filename: ":memory:"
    }
  });

  await db.attach(entities);
  reset.add(() => db.close());

  return db;
}

afterEach(async () => {
  for(const cb of reset){
    reset.delete(cb);
    await cb()
  }
});