import knex, { Knex } from 'knex';
import { Type } from '../Type';
import { Schema } from './Schema';

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

class Connection {
  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }

  database?: string;

  managed = new Set<typeof Type>();
  schema: { [name: string]: Schema } = {};
  knex: Knex;

  constructor(knexConfig: Knex.Config) {
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
}

async function toSchemaBuilder(
  knex: Knex<any, any[]>,
  types: (typeof Type)[],
  strict?: boolean){

  const builder = knex.schema;

  await Promise.all(
    Object.values(types).map(async type => {
      type.ready();

      const exists = await validate(type, knex);
  
      if(exists)
        return;
      else if(strict)
        throw new Error(`Table ${type.table} does not exist!`);
  
      create(builder, type);
    })
  )

  return builder;
}

async function validate(type: Type.EntityType, knex: Knex, strict?: boolean){
  const { table: name } = type;

  const exists = await knex.schema.hasTable(name);

  if(!exists)
    return false;

  const columns = await knex(name).columnInfo();
  
  for (const [_property, field] of type.fields) {
    const {
      column,
      datatype,
      nullable = false,
      // primary,
      // default: defaultTo,
      // unique,
    } = field;

    if(!datatype)
      return;

    const info = columns[column];

    if(!info)
      throw new Error(`Column ${column} does not exist`);

    const hasType = info.type + (info.maxLength ? `(${info.maxLength})` : '');

    if(hasType.toLowerCase() !== datatype.toLowerCase())
      throw new Error(`Column ${column} has incorrect datatype`);

    if(info.nullable != nullable)
      throw new Error(`Column ${column} has incorrect nullable value`);
  }

  return true;
}

function create(builder: Knex.SchemaBuilder, type: Type.EntityType){
  const { table: name } = type;

  builder.createTable(name, (table) => {
    for(const [_property, field] of type.fields){
      const {
        column,
        increment,
        datatype,
        default: defaultTo,
        nullable,
        primary,
        unique,
      } = field;

      if(!datatype)
        return;

      if(increment){
        table.increments(column);
        continue;
      }

      const col = table.specificType(column, datatype);

      if(primary)
        col.primary();

      if(unique)
        col.unique();

      if(defaultTo)
        col.defaultTo(defaultTo);

      if(!nullable)
        col.notNullable();
    }
  });
}

export { Connection }