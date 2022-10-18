import Connection from '../connection/Connection';
import Entity from '../Entity';
import { asPromise } from '../utility';
import { constraints, create } from './bootstrap';
import * as schema from './schema';

import type mysql from 'mysql';

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

    const mysql = require("mysql");

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

    return asPromise<T[]>(cb => connection.query(qs, cb));
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return asPromise(cb => connection.end(cb));
  }

  createTables(){
    const commands = [] as string[];

    for(const entity of this.managed)
      commands.push(create(entity));

    for(const entity of this.managed){
      const statement = constraints(entity);

      if(statement)
        commands.push(statement);
    }
    
    return this.query(commands.join(";"));
  }
}

export default MySQLConnection;