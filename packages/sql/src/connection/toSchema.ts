import { Knex } from "knex";
import { Type } from "../Type";

export async function toSchemaBuilder(
  knex: Knex<any, any[]>,
  types: Type.EntityType[],
  create?: boolean){

  const builder = knex.schema;

  await Promise.all(
    Object.values(types).map(async type => {
      const exists = await validate(type, knex);
  
      if(exists)
        return;
      else if(create === false)
        throw new Error(`Table ${type.table} does not exist!`);
  
      builder.createTable(type.table, (table) => {
        for(const field of type.fields.values()){
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
    })
  )

  return builder;
}

async function validate(type: Type.EntityType, knex: Knex, strict?: boolean){
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