import knex, { Knex } from 'knex';

import { Type } from '../Type';

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
  knex: Knex;

  constructor(knexConfig?: Knex.Config) {
    if(!defaultConnection)
      defaultConnection = this;

    this.knex = knex(knexConfig || DEFAULT_CONFIG);
  }

  async query(qs: string){
    return this.knex.raw(qs);
  }

  async close(){
    return this.knex.destroy();
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

      field.verify(info);
    });

    return true;
  }

  async attach(types: Entities, create?: boolean){
    types = Object.values(types);

    const pending = new Set<Type.EntityType>();
    const validate = async (type: Type.EntityType) => {
      const valid = await this.validate(type);

      type.connection = this;
      this.managed.add(type);

      if(!valid && create === false)
        throw new Error(`Table ${type.table} does not exist.`);

      pending.add(type);
    }

    await Promise.all(types.map(validate));

    return await this.schema(types);
  }

  schema(types: Entities){
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