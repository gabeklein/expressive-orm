import sqlite3 from 'sqlite3';

import Connection from '../connection/Connection';
import Entity from '../Entity';
import bootstrap from '../mysql/bootstrap';

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

  query<T>(qs: string){
    return new Promise<T[]>((resolve, reject) => {
      if(!this.connection)
        reject(new Error("Connection is in dry-mode."));
      else
        this.connection.all(qs, (err: Error | null, results: any[]) => {
          if(err)
            reject(err);
          else
            resolve(results);
        })
    })
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return new Promise<void>((res, rej) => {
      connection.close(error => {
        if(error)
          rej(error)
        else
          res();
      });
    })
  }

  createTables(dryRun: true): string; 
  createTables(dryRun?: false): Promise<void>;
  createTables(dryRun?: boolean){
    return bootstrap(this, dryRun);
  }
}

export default SQLiteConnection;