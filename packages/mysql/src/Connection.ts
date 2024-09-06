import { Util, Connection, Type } from '@expressive/sql';

import { bootstrap } from './bootstrap';
import * as schema from './infoSchema';
import { getSchema } from './getSchema';

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

  constructor(opts: MySQLConnection.Config | Type.EntityType[] = {}){
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
      .values<Type.EntityType>(schema)
      .forEach(entity => {
        entity.connection = this;
        entity.ensure()
      })

    if(opts.use)
      this.apply(opts.use);
  }

  async getSchema(name?: string){
    if(!name)
      name = this.database;

    if(!name)
      throw new Error("No database specified, and no default one exists!");

    let schema = this.schema[name];

    if(!schema)
      schema = await getSchema(name);

    return this.schema[name] = schema;
  }

  query<T extends {} = any>(qs: string){
    const { connection } = this;

    if(!connection)
      return Promise.reject( new Error("No connection"));

    return Util.asPromise<T[]>(cb => connection.query(qs, cb));
  }

  close(){
    const { connection } = this;

    if(!connection)
      return Promise.reject(new Error("No connection"));

    return Util.asPromise(cb => connection.end(cb));
  }

  createTables(){
    return this.query(bootstrap(this.managed));
  }
}

export { MySQLConnection }