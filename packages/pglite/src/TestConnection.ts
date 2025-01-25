import { Connection } from '@expressive/sql';

import { PGLiteConnection } from './PGLiteConnection';

const reset = new Set<Function>();
let cleanup: Function | undefined;

afterEach(() => {
  Promise.all(Array.from(reset).map(cb => {
    reset.delete(cb);
    return cb();
  }));
});

afterAll(() => cleanup && cleanup());

/**
 * An in-memory database specific to a
 * test and attaches entities provided to it.
 **/
export class TestConnection extends PGLiteConnection {
  constructor(
    using: Connection.Types,
    private after?: () => void){

    super(using);

    if(expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(async () => { await this });
      cleanup = () => {
        return this.close();
      }
    }
  }

  then(onfulfilled?: (value: void) => any) {
    this.sync(true).then(() => {
      if(this.after) this.after();
      if(onfulfilled) onfulfilled();
    });
  }
}