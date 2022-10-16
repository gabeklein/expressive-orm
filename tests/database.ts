import Entity, { SQLiteConnection } from '../src';

const { format } = require('sql-formatter');

declare namespace TestConnection {
  interface Options extends SQLiteConnection.Config {
    logs?: boolean;
  }
}

export class TestConnection extends SQLiteConnection {
  logs?: boolean
  
  constructor(options: TestConnection.Options | Entity.Type[]){
    super(options);

    if("logs" in options)
      this.logs = options.logs;

    beforeAll(() => {
      return this.createTables();
    })

    afterAll(() => {
      this.close();
    });
  }

  query(qs: string){
    if(this.logs)
      console.log(format(qs));

    return super.query(qs);
  }
}