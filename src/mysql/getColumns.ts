import Schema from '../connection/Schema';
import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';
import Referential from './info/Referential';

async function getColumns(schema: string){
  return Query.get(where => {
    const { from, join, equal } = where;

    const column = from(Column);
    const usage = join(KeyColumnUsage, "left");
    const ref = join(Referential, "left");

    equal(usage.tableSchema, column.schema);
    equal(usage.tableName, column.tableName);
    equal(usage.columnName, column.name);

    equal(ref.constraintName, usage.constraintName);
    equal(ref.constraintSchema, column.schema);
    equal(ref.tableName, column.tableName);

    equal(column.schema, schema);

    return (): Schema.Column => {
      const {
        dataType,
        isNullable = false,
        name = "",
        schema,
        tableName,
        type
      } = column;

      const {
        constraintName,
        referencedColumnName,
        referencedTableName
      } = usage;

      const {
        deleteRule,
        updateRule
      } = ref;

      const isPrimary = constraintName == "PRIMARY";
      let reference: Schema.Reference | undefined;

      if(referencedTableName)
        reference = {
          table: referencedTableName,
          column: referencedColumnName!,
          name: constraintName,
          deleteRule,
          updateRule
        };

      return {
        dataType,
        isNullable,
        isPrimary,
        name,
        reference,
        schema,
        tableName,
        type,
      }
    }
  });
}

export default getColumns;