import { Connection } from "../";

const reset = new Set<Function>();
let after: Function | undefined;

/**
 * Generates a new in-memory database specific to
 * a test and attaches entities provided to it.
 **/
export function inMemoryDatabase(
  entities: Connection.Types, after?: () => void){

  const db = new Connection({
    client: "sqlite3",
    useNullAsDefault: true,
    connection: {
      filename: ":memory:"
    }
  });

  let init_db = db.attach(entities);

  if(after)
    init_db = init_db.then(after);

  if(expect.getState().currentTestName){
    reset.add(() => db.close());
    return init_db;
  }

  beforeAll(() => init_db);
  after = () => db.close();

  return db
}

afterEach(async () => {
  await Promise.all(Array.from(reset).map(cb => {
    reset.delete(cb);
    return cb();
  }));
});

afterAll(() => after && after());