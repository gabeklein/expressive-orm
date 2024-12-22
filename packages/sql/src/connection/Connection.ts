import knex, { Knex } from 'knex';

import { Field, Type } from '..';
import { assign, freeze, values } from '../utils';

declare namespace Connection {
  type Types =
    | typeof Type[]
    | { [key: string | number]: typeof Type }

  type MySQLConfig = Knex.MySqlConnectionConfig;
  type SQLiteConfig = Knex.Sqlite3ConnectionConfig;
  type PostgresConfig = Knex.PgConnectionConfig;

  type Using = { [key: string | number]: typeof Type };
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
  using: Readonly<Connection.Types>;
  ready = false;

  managed = new Set<typeof Type>();
  knex: Knex;

  constructor(
    using: Connection.Types,
    knexConfig?: Knex.Config) {

    this.using = freeze(assign({}, using));

    if(!defaultConnection)
      defaultConnection = this;

    this.knex = knex(knexConfig || DEFAULT_CONFIG);
  }

  toString(){
    return this.schema(this.using).toString();
  }

  async send(qs: string){
    return this.knex.raw(qs);
  }

  async close(){
    return this.knex.destroy();
  }

  async sync(readonly?: boolean){
    if(this.ready)
      throw new Error("Connection is already active.");

    const types = values(this.using);

    const include = async (type: Type.EntityType) => {
      const valid = await this.validate(type);

      type.connection = this;
      this.managed.add(type);

      if(!valid && readonly === true)
        throw new Error(`Table ${type.table} does not exist.`);
    }

    await Promise.all(types.map(include));

    await this.schema(types);

    this.ready = true;
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

      this.integrity(field, info);
    });

    return true;
  }

  schema(types: Readonly<Connection.Types>){
    const { schema } = this.knex;

    values(types).forEach(type => {
      schema.createTable(type.table, builder => {
        this.create(type, builder);
      });
    });
  
    return schema;
  }

  /**
   * This methods verifies that a column in the database matches the settings expected by a given Field.
   * Will throw an error if the column does not match, unless the `fix` parameter is set to true and schema is corrected.
   * 
   * @param info Information about the column in the database.
   * @param fix Whether to automatically fix the column to match this Field's settings.
   */
  protected async integrity(field: Field, info: Knex.ColumnInfo, fix?: boolean){
    const { column, datatype, nullable, parent, foreignTable, foreignKey } = field;
    const signature = info.type + (info.maxLength ? `(${info.maxLength})` : '');

    if (signature.toLowerCase() !== datatype.toLowerCase())
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${signature}, expected ${datatype}`
      );

    if (info.nullable !== nullable)
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    if(!foreignTable || !foreignKey)
      return;
      
    const knex = field.parent.connection.knex;
    const foreignTableExists = await knex.schema.hasTable(foreignTable);

    if (!foreignTableExists)
      throw new Error(`Referenced table ${foreignTable} does not exist`);

    const foreignColumns = await knex(foreignTable).columnInfo();
    const foreignColumnInfo = foreignColumns[foreignKey];

    if (!foreignColumnInfo)
      throw new Error(
        `Referenced column ${field.foreignKey} does not exist in table ${foreignTable}`
    );
  }

  /**
   * This method is used to generate a column in a SQL table for a given Field.
   *  
   * @param table The table being created.
   * @returns The column definition.
   */
  protected create(type: Type.EntityType, builder: Knex.CreateTableBuilder){
    type.fields.forEach(field => {
      if(!field.datatype)
        throw new Error(`Column ${field.property} has no datatype.`);

      const {
        column,
        datatype,
        nullable,
        increment,
        unique,
        fallback,
        foreignKey,
        foreignTable,
        property
      } = field;

      const col = increment
        ? builder.increments(column)
        : builder.specificType(column, datatype);

      if(!column)
        throw new Error(`Column ${property} has no datatype.`);

      if(!nullable)
        col.notNullable();

      if(unique)
        col.unique();

      if(fallback)
        col.defaultTo(fallback);

      if(foreignKey)
        col.references(foreignKey).inTable(foreignTable!);

      return col;
    });
  }

  static get default(){
    return defaultConnection;
  }

  static set default(connection: Connection){
    defaultConnection = connection;
  }
}

export { Connection }