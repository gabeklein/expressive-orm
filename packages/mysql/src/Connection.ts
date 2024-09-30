import { Connection, Type } from '@expressive/sql';

import * as schema from './infoSchema';

import mysql from 'mysql';

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
  database?: string;

  constructor(opts: Connection.MySQLConfig = {}){
    super({
      client: 'mysql',
      connection: opts,
      useNullAsDefault: true
    });

    this.database = opts.database;
    this.options = opts;

    opts.multipleStatements = true;

    Object
      .values<Type.EntityType>(schema)
      .forEach(entity => {
        entity.connection = this;
        entity.fields;
      })
  }
}

export { MySQLConnection }