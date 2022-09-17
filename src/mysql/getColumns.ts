import Schema from '../connection/Schema';
import Query from '../Query';
import Column from './info/Column';
import KeyColumnUsage from './info/KeyColumnUsage';
import Referential from './info/Referential';

async function getColumns(schema: string){
  return Query.get<Schema.Column>(where => {
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

    return () => {
      const {
        tableName,
        name,
        dataType,
        type,
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
        column: referencedColumnName!,
        name: constraintName,
        deleteRule,
        updateRule
      } : undefined;

      const values = dataType == "enum"
        ? type.slice(5, -1).split(",").map(x => x.replace(/^'|'$/g, ""))
        : undefined;

      return {
        table: tableName,
        name: name!,
        type: dataType,
        nullable: !!isNullable,
        values,
        schema,
        maxLength,
        reference,
        primary
      }
    }
  });
}

export default getColumns;