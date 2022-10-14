import mysql from 'mysql';

import Connection from '../connection/Connection';
import Entity from '../Entity';
import bootstrap from './bootstrap';
import * as schema from './schema';

declare namespace MySQLConnection {
  interface Config extends mysql.ConnectionConfig {
    dry?: boolean;
    maxConnections?: number;
    sync?: boolean;
    nuke?: boolean;
    use?: Connection.Entities
  }
}

class MySQLConnection extends Connection {
  options: MySQLConnection.Config;
  connection?: mysql.Connection | mysql.Pool;
  database?: string;

  constructor(opts: MySQLConnection.Config | Entity.Type[] = {}){
    super();

    if(Array.isArray(opts))
      opts = { use: opts };

    this.database = opts.database;
    this.options = opts;

    opts.multipleStatements = true;

    if(!opts.dry)
      this.connection = opts.maxConnections! > 1
        ? mysql.createPool({ ...opts,
          connectionLimit: opts.maxConnections
        })
        : mysql.createConnection(opts);

    Object
      .values<Entity.Type>(schema)
      .forEach(entity => entity.ensure(this))

    if(opts.use)
      this.apply(opts.use);
  }

  query<T extends {} = any>(qs: string){
    return new Promise<T>((resolve, reject) => {
      if(!this.connection)
        reject(new Error("Connection is in dry-mode."));
      else
        this.connection.query(qs, (err, result) => {
          if(err)
            reject(err);
          else
            resolve(result);
        })
    })
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return new Promise<void>((res, rej) => {
      connection.end(error => {
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

export default MySQLConnection;