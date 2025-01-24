import { Connection } from '@expressive/sql';
import { SQLiteConnection } from '@expressive/sqlite';

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
export class TestConnection extends SQLiteConnection {
  constructor(
    using: Connection.Types,
    private after?: () => void){

    super(using);

    if(expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(async () => this);
      cleanup = () => this.close();
    }
  }

  then(onfulfilled?: (value: void) => any) {
    this.sync(true).then(() => {
      if(this.after) this.after();
      if(onfulfilled) onfulfilled();
    });
  }
}