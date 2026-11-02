import { afterAll, afterEach, beforeAll, expect } from 'vitest';

import type { Connection } from '@expressive/sql';

import { SQLiteConnection } from './SQLiteConnection';

const reset = new Set<() => Promise<void>>();

afterEach(() => Promise.all(Array.from(reset, close => {
  reset.delete(close);
  return close();
})));

export class TestConnection extends SQLiteConnection {
  constructor(
    using: Connection.Types,
    private after?: () => Promise<void>){

    super(using);

    if (expect.getState().currentTestName)
      reset.add(() => this.close());
    else {
      beforeAll(() => this.then());
      afterAll(() => this.close());
    }
  }

  async sync(fix?: boolean){
    const self = await super.sync(fix);

    if (this.after)
      await this.after();

    return self;
  }
}
