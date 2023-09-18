import { Connection, Entity, Util } from '@expressive/sql';

import { bootstrap } from './bootstrap';

import type sqlite3 from 'sqlite3';

declare namespace SQLiteConnection {
  interface Config {
    use?: Connection.Entities;
    file?: string;
  }
}

class SQLiteConnection extends Connection {
  options: SQLiteConnection.Config;
  connection: sqlite3.Database;
  database?: string;

  constructor(opts: SQLiteConnection.Config | Entity.Type[] = {}){
    super();

    if(Array.isArray(opts))
      opts = { use: opts };

    const sqlite3 = require("sqlite3");
    const database = opts.file || ':memory:';
    const connection = new sqlite3.Database(database);

    this.connection = connection;
    this.options = opts;
    this.database = database;

    if(opts.use)
      this.apply(opts.use);
  }

  query<T = any>(qs: string){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return Util.asPromise<T[]>(cb => connection.all(qs, cb));
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return Util.asPromise(cb => connection.close(cb));
  }

  createTables(){
    return this.query(bootstrap(this.managed));
  }
}

export default SQLiteConnection;