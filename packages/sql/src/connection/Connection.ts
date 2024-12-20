import knex, { Knex } from 'knex';

import { Type } from '../Type';

namespace Connection {
  export type Types =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  export type MySQLConfig = Knex.MySqlConnectionConfig;
  export type SQLiteConfig = Knex.Sqlite3ConnectionConfig;
  export type PostgresConfig = Knex.PgConnectionConfig;
}

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
  knex: Knex;

  constructor(knexConfig?: Knex.Config) {
    if(!defaultConnection)
      defaultConnection = this;

    this.knex = knex(knexConfig || DEFAULT_CONFIG);
  }

  async send(qs: string){
    return this.knex.raw(qs);
  }

  async close(){
    return this.knex.destroy();
  }

  async attach(types: Connection.Types, create?: boolean){
    types = Object.values(types);

    const include = async (type: Type.EntityType) => {
      const valid = await this.validate(type);

      type.connection = this;
      this.managed.add(type);

      if(!valid && create === false)
        throw new Error(`Table ${type.table} does not exist.`);
    }

    await Promise.all(types.map(include));

    return await this.schema(types);
  }

  async validate(type: Type.EntityType){
    const { table } = type;
    const exists = await this.knex.schema.hasTable(table);
   
    if(!exists)
      return false;

    const columns = await this.knex(table).columnInfo();
  
    type.fields.forEach(field => {
      const info = columns[field.column];

      if(!field.datatype)
        return;

      if(!info)  
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      field.integrity(info);
    });

    return true;
  }

  schema(types: Connection.Types){
    const { schema } = this.knex;

    Object.values(types).forEach(type => {
      schema.createTable(type.table, builder => {
        type.fields.forEach(field => field.create(builder));
      });
    });
  
    return schema;
  }

  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }
}

export { Connection }