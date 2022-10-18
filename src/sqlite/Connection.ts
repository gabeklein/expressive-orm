import sqlite3 from 'sqlite3';

import Connection from '../connection/Connection';
import Entity from '../Entity';
import { constraint, table } from './bootstrap';

declare namespace SQLiteConnection {
  interface Config {
    use?: Connection.Entities;
    file?: string;
  }
}

class SQLiteConnection extends Connection {
  options: SQLiteConnection.Config;
  connection?: sqlite3.Database;
  database?: string;

  constructor(opts: SQLiteConnection.Config | Entity.Type[] = {}){
    super();

    if(Array.isArray(opts))
      opts = { use: opts };

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
      return Promise.reject( new Error("No connection"));

    return new Promise<T[]>((res, rej) => {
      connection.all(qs, (err, data) => {
        err ? rej(err) : res(data);
      })
    })
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return new Promise<void>((res, rej) => {
      connection.close(err => err ? rej(err) : res());
    })
  }

  createTables(){
    const commands = [] as string[];

    for(const entity of this.managed)
      commands.push(table(entity));

    for(const entity of this.managed){
      const statement = constraint(entity);

      if(statement)
        commands.push(statement);
    }
    
    return this.query(commands.join(";"));
  }
}

export default SQLiteConnection;