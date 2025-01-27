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

    if(expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(() => this.then());
      cleanup = () => this.close();
    }
  }

  async sync(fix?: boolean){
    await super.sync(fix);
    if(this.after) this.after();
  }
}