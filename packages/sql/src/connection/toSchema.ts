import { Knex } from 'knex';

import { Type } from '../Type';

export async function toSchemaBuilder(
  knex: Knex<any, any[]>,
  types: Type.EntityType[],
  create?: boolean){

  const builder = knex.schema;

  await Promise.all(types.map(async type => {
    const exists = await expect(knex, type);

    if(exists)
      return;
    else if(create === false)
      throw new Error(`Table ${type.table} does not exist!`);

    builder.createTable(type.table, (table) => {
      for(const field of type.fields.values())
        field.register(table);
    });
  }))

  return builder;
}

async function expect(knex: Knex, type: Type.EntityType, strict?: boolean){
  const { table, fields } = type;

  const exists = await knex.schema.hasTable(table);

  if(!exists)
    return false;

  const columns = await knex(table).columnInfo();

  for (const field of fields.values()) {
    const {
      column,
      datatype,
      nullable = false,
      references
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

    if (references) {
      const foreignTable = references.table;
      const foreignColumn = references.column;

      // Check if foreign table exists
      const foreignTableExists = await knex.schema.hasTable(foreignTable);

      if (!foreignTableExists)
        throw new Error(`Referenced table ${foreignTable} does not exist`);

      // Check if foreign column exists
      const foreignColumns = await knex(foreignTable).columnInfo();
      const foreignColumnInfo = foreignColumns[foreignColumn];

      if (!foreignColumnInfo)
        throw new Error(
          `Referenced column ${foreignColumn} does not exist in table ${foreignTable}`
        );
    }
  }

  return true;
}