import { Connection } from '@expressive/sql';

import { SQLiteConnection } from './SQLiteConnection';

const reset = new Set<Function>();
let cleanup: Function | undefined;

afterEach(() => {
  Promise.all(Array.from(reset).map(cb => {
    reset.delete(cb);
    return cb();
  }));
});

afterAll(() => cleanup && cleanup());

export class TestConnection extends SQLiteConnection {
  constructor(
    using: Connection.Types,
    private after?: () => void){

    super(using);

    // Bun has no expect.getState().currentTestName. Built during describe setup
    // we can register lifecycle hooks; built inside a test, beforeAll() throws -
    // use that to fall back to per-test cleanup.
    try {
      beforeAll(() => this.then());
      cleanup = () => this.close();
    }
    catch {
      reset.add(() => this.close());
    }
  }

  async sync(fix?: boolean){
    const self = await super.sync(fix);
    if(this.after) this.after();
    return self;
  }
}