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
  }
}

class MySQLConnection extends Connection {
  options: MySQLConnection.Config;
  connection?: mysql.Connection | mysql.Pool;
  database?: string;

  constructor(
    opts: MySQLConnection.Config = {},
    entities?: Connection.Entities){

    super();

    const config: mysql.ConnectionConfig = {
      ...opts,
      multipleStatements: true
    }
    
    this.database = opts.database;
    this.options = opts;

    if(!opts.dry)
      this.connection = opts.maxConnections! > 1
        ? mysql.createPool(config)
        : mysql.createConnection(config);

    Object.values<typeof Entity>(schema).forEach(entity => {
      entity.ensure(this);
    })

    if(entities)
      this.apply(entities);
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
    if(this.connection)
      this.connection.end();
  }

  createTables(dryRun: true): string; 
  createTables(dryRun?: false): Promise<void>;
  createTables(dryRun?: boolean){
    return bootstrap(this, dryRun);
  }
}

export default MySQLConnection;