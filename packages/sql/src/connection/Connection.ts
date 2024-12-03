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
    const { schema } = knex;

    types = Object.values(types);

    for (const type of types) {
      type.connection = this;
      this.managed.add(type);
    }

    async function ensure(type: Type.EntityType){
      const { table, fields } = type;
      const exists = await schema.hasTable(table);
  
      if(exists){
        const columns = await knex(table).columnInfo();
  
        fields.forEach(field => {
          const info = columns[field.column];
      
          if(field.datatype)
            if(info)
              field.verify(info);
            else
              throw new Error(`Column ${field.column} does not exist in table ${table}`);
        });
      }
      else if(create === false)
        throw new Error(`Table ${table} does not exist!`);
  
      schema.createTable(table, builder => {
        fields.forEach(field => field.register(builder));
      });
    }
  
    await Promise.all(types.map(ensure));
  
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