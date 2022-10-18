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
    const { connection } = this;

    if(!connection)
      return Promise.reject( new Error("No connection"));

    return new Promise<T[]>((res, rej) => {
      connection.query(qs, (err, data) => {
        err ? rej(err) : res(data);
      })
    })
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return new Promise<void>((res, rej) => {
      connection.end(err => err ? rej(err) : res());
    })
  }

  createTables(dryRun: true): string; 
  createTables(dryRun?: false): Promise<void>;
  createTables(dryRun?: boolean){
    return bootstrap(this, dryRun);
  }
}

export default MySQLConnection;