import { Connection } from ".";

const reset = new Set<Function>();
let cleanup: Function | undefined;

afterEach(() => {
  return Promise.all(Array.from(reset).map(cb => {
    reset.delete(cb);
    return cb();
  }));
});

afterAll(() => cleanup && cleanup());

/**
 * An in-memory database specific to a
 * test and attaches entities provided to it.
 **/
export class TestConnection extends Connection {
  constructor(
    public using: Connection.Types,
    private after?: () => void){

    super(using, {
      client: "sqlite3",
      useNullAsDefault: true,
      connection: {
        filename: ":memory:"
      }
    });

    if(expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(async () => this);
      cleanup = () => this.close();
    }
  }

  then(onfulfilled?: (value: void) => any) {
    this.sync().then(() => {
      if(this.after) this.after();
      if(onfulfilled) onfulfilled();
    });
  }
}