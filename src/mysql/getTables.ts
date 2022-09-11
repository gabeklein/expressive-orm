// @ts-nocheck 
import { generateEntities, Schema } from '../generate/entities';
import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';
import Referential from './info/Referential';

async function getColumns(){
  const query = new Query($ => {
    const column = $.from(Column);
    const usage = $.join(KeyColumnUsage, "left");
    const refCon = $.join(Referential, "left");

    refCon.constraintName.is(usage.constraintName);
    refCon.constraintSchema.is(usage.tableSchema);
    refCon.tableName.is(usage.tableName);

    usage.tableSchema.is(column.schema);
    usage.tableName.is(column.tableName);
    usage.columnName.is(column.name);

    return () => {
      const {
        tableName,
        name,
        dataType,
        maxLength,
        isNullable,
        schema
      } = column;

      const {
        constraintName,
        referencedTableName,
        referencedColumnName
      } = usage;

      const {
        deleteRule,
        updateRule
      } = refCon;

      let reference;
      let primary = false;

      if(constraintName == "PRIMARY")
        primary = true;
        
      else if(referencedTableName)
        reference = {
          table: referencedTableName,
          column: referencedColumnName,
          name: constraintName,
          deleteRule,
          updateRule
        }
      
      return {
        table: tableName,
        name,
        type: dataType,
        nullable: isNullable == "YES",
        schema,
        maxLength,
        reference,
        primary
      }
    }
  })

  console.log(query.toString());

  return query.get();
}

async function getTables(schema: string){
  const results = await getColumns();
  const tables = new Map<string, Schema.Table>();

  for(const result of results){
    const name = result.table;
    let table = tables.get(name);

    if(!table){
      table = {
        name,
        schema: result.schema,
        columns: []
      }
      
      tables.set(name, table);
    }

    table.columns.push(result);
  }

  return generateEntities(...tables.values());
}

export default getTables;