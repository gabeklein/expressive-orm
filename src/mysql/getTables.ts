import { generateEntities, Schema } from '../generate/entities';
import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';
import Referential from './info/Referential';

async function getSchema(schema: string){
  const columns = await getColumns(schema);
  const tables = new Map<string, Schema.Table>();

  columns.forEach(column => {
    const name = column.table;
    let table = tables.get(name);

    if(!table){
      table = {
        name,
        schema: column.schema,
        columns: new Map<string, Schema.Column>()
      }
      
      tables.set(name, table);
    }

    table.columns.set(column.name, column);
  });

  return generateEntities(tables);
}

async function getColumns(schema: string){
  return Query.get(where => {
    const { from, join, equal } = where;

    const column = from(Column);
    const usage = join(KeyColumnUsage, "left");
    const ref = join(Referential, "left");

    equal(ref.constraintName, usage.constraintName);
    equal(ref.constraintSchema, column.schema);
    equal(ref.tableName, column.tableName);

    equal(usage.tableSchema, column.schema);
    equal(usage.tableName, column.tableName);
    equal(usage.columnName, column.name);

    equal(column.schema, schema);

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
      
      return <Schema.Column>{
        table: tableName,
        name,
        type: dataType,
        nullable: isNullable,
        schema,
        maxLength,
        reference,
        primary
      }
    }
  });
}

export default getSchema;