import { Knex } from "knex";
import { Type } from "../Type";

export async function toSchemaBuilder(
  knex: Knex<any, any[]>,
  types: Type.EntityType[],
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