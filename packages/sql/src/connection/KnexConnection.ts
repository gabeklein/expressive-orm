import knex, { Knex } from 'knex';

import { Connection, Field, Type } from '..';

export class KnexConnection extends Connection {
  protected engine: Knex;

  constructor(
    using: Connection.Types,
    knexConfig?: Knex.Config) {

    super(using);

    this.engine = knex(knexConfig || {
      client: 'sqlite3',
      useNullAsDefault: true,
      connection: {
        filename: ':memory:'
      }
    });
  }

  toString(){
    return this.schema(this.using).toString();
  }

  async send(qs: string){
    return this.engine.raw(qs);
  }

  async close(){
    return this.engine.destroy();
  }

  async sync(fix?: boolean){
    if(this.ready)
      throw new Error("Connection is already active.");

    const include = async (type: Type.EntityType) => {
      const valid = await this.valid(type);

      if(!valid && fix !== true)
        throw new Error(`Table ${type.table} does not exist.`);
    }

    await Promise.all(Array.from(this.using).map(include));
    await this.schema(this.using);

    Object.defineProperty(this, 'ready', { value: true });
  }

  async valid(type: Type.EntityType){
    const { table } = type;
    const exists = await this.engine.schema.hasTable(table);
   
    if(!exists)
      return false;

    const columns = await this.engine(table).columnInfo();
  
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

  schema(types: Iterable<typeof Type>){
    const { schema } = this.engine;

    for(const type of types)
      this.create(type, schema);

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

    if(field.parent.connection !== this)
      throw new Error(`Foreign key ${foreignTable}.${foreignKey} cannot be checked by another connection`);
      
    const foreignTableExists = await this.engine.schema.hasTable(foreignTable);

    if (!foreignTableExists)
      throw new Error(`Referenced table ${foreignTable} does not exist`);

    const foreignColumns = await this.engine(foreignTable).columnInfo();
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
  protected create(type: Type.EntityType, schema: knex.Knex.SchemaBuilder){
    schema.createTable(type.table, builder => {
      type.fields.forEach(field => {
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

        if(!datatype)
          throw new Error(`Column ${field.property} has no datatype.`);
  
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
    });
  }
}