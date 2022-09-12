// @ts-nocheck 
import { generateEntities, Schema } from '../generate/entities';
import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';
import Referential from './info/Referential';

async function getColumns(){
  return Query.get(where => {
    const { from, joins, equal } = where;

    const column = from(Column);
    const usage = joins(KeyColumnUsage, "left");
    const ref = joins(Referential, "left");

    equal(ref.constraintName, usage.constraintName);
    equal(ref.constraintSchema, usage.tableSchema);
    equal(ref.tableName, usage.tableName);

    equal(usage.tableSchema, column.schema);
    equal(usage.tableName, column.tableName);
    equal(usage.columnName, column.name);

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

      const { deleteRule, updateRule } = ref;

      const primary = constraintName == "PRIMARY";

      const reference = referencedTableName ? {
        table: referencedTableName,
        column: referencedColumnName,
        name: constraintName,
        deleteRule,
        updateRule
      } : undefined;
      
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
  });
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