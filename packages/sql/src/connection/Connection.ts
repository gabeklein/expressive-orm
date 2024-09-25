import knex, { Knex } from 'knex';

import { Type } from '../Type';
import { Schema } from './Schema';
import { toSchemaBuilder } from './toSchema';

namespace Connection {
  export type Entities =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  export type SQLiteConfig = Knex.Sqlite3ConnectionConfig;
  export type PostgresConfig = Knex.PgConnectionConfig;
  export type MySQLConfig = Knex.MySqlConnectionConfig;
}

export type Entities = Connection.Entities;

let defaultConnection: Connection;

const DEFAULT_CONFIG: Knex.Config = {
  client: 'sqlite3',
  useNullAsDefault: true,
  connection: {
    filename: ':memory:'
  }
}

class Connection {
  database?: string;

  managed = new Set<typeof Type>();
  schema: { [name: string]: Schema } = {};
  knex: Knex;

  constructor(knexConfig: Knex.Config = DEFAULT_CONFIG) {
    Connection.default = this;
    this.knex = knex(knexConfig);
  }

  async query(qs: string){
    return this.knex.raw(qs);
  }

  async close(){
    return this.knex.destroy();
  }

  async attach(types: Entities, strict?: boolean){
    const { knex } = this;
    types = Object.values(types);

    for (const type of types) {
      type.ready();
      type.connection = this;
      this.managed.add(type);
    }

    return toSchemaBuilder(knex, types, strict);
  }

  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }
}

export { Connection }