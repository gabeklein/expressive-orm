import { Entity } from '@expressive/sql';
import SQLiteConnection from '../Connection';

const { format } = require('sql-formatter');

namespace TestConnection {
  export interface Options extends SQLiteConnection.Config {
    logs?: boolean;
  }

  export type Effect =
    (connection: TestConnection) => MaybeAsync<(() => void) | void>;

  type MaybeAsync<T> = T | Promise<T>;
}

class TestConnection extends SQLiteConnection {
  logs?: boolean
  
  constructor(options: TestConnection.Options | Entity.Type[]){
    super(options);

    if("logs" in options)
      this.logs = options.logs;
  }

  query(qs: string){
    if(this.logs)
      console.log(format(qs));

    return super.query(qs);
  }

  static create(
    argument: TestConnection.Options | Entity.Type[],
    effect?: TestConnection.Effect){
    
    const conn = new this(argument);
    let callback: (() => void) | undefined;

    beforeAll(async () => {
      await conn.createTables();

      if(effect)
        Promise.resolve(effect(conn)).then(cb => {
          if(cb)
            callback = cb;
        });
    })

    afterAll(() => {
      if(callback)
        callback();

      conn.close();
    });

    return conn;
  }
}

export { TestConnection }