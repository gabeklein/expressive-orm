import knex, { Knex } from 'knex';

import { Type } from '../Type';
import { Schema } from './Schema';
import { toSchemaBuilder } from './toSchema';

namespace Connection {
  export type Entities =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  export type MySQLConfig = Knex.MySqlConnectionConfig;
  export type SQLiteConfig = Knex.Sqlite3ConnectionConfig;
  export type PostgresConfig = Knex.PgConnectionConfig;
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

  constructor(knexConfig?: Knex.Config) {
    Connection.default = this;
    this.knex = knex(knexConfig || DEFAULT_CONFIG);
  }

  async query(qs: string){
    return this.knex.raw(qs);
  }

  async close(){
    return this.knex.destroy();
  }

  async attach(types: Entities, create?: boolean){
    const { knex } = this;
    types = Object.values(types);

    for (const type of types) {
      type.connection = this;
      this.managed.add(type);
    }

    return toSchemaBuilder(knex, types, create);
  }

  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }
}

export { Connection }