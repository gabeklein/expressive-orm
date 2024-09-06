import { Type } from '@expressive/sql';
import { SQLiteConnection } from '../Connection';

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
  
  constructor(options: TestConnection.Options | Type.EntityType[]){
    super(options);

    if("logs" in options)
      this.logs = options.logs;
  }

  query(qs: string){
    if(this.logs)
      console.log(format(qs));

    return super.query(qs);
  }

  static prepare(
    argument: Type.EntityType[],
    effect?: TestConnection.Effect){
    
    const connect = new this(argument);
    let callback: (() => void) | undefined;

    beforeAll(async () => {
      await connect.createTables();

      if(effect)
        Promise.resolve(effect(connect)).then(cb => {
          if(cb)
            callback = cb;
        });
    })

    afterAll(() => {
      if(callback)
        callback();

      connect.close();
    });

    return connect;
  }
}

export { TestConnection }