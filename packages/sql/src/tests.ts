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

    super({
      client: "sqlite3",
      useNullAsDefault: true,
      connection: {
        filename: ":memory:"
      }
    });

    if(expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(async () => {
        await this.attach(using).then(after)
      });
      cleanup = () => this.close();
    }
  }

  toString(){
    return this.schema(this.using).toString();
  }

  then(onfulfilled?: (value: void) => any) {
    this.attach(this.using).then(() => {
      if(this.after) this.after();
      if(onfulfilled) onfulfilled();
    });
  }
}