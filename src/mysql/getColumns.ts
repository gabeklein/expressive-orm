import Schema from '../connection/Schema';
import Select from '../query/Select';
import { Column, KeyColumnUsage, ReferentialConstraints } from './schema';

async function getColumns(schema: string){
  return Select.get(where => {
    const column = where.from(Column);
    const usage = where.join(KeyColumnUsage, "left");
    const ref = where.join(ReferentialConstraints, "left");

    where(usage.tableSchema).is(column.schema);
    where(usage.tableName).is(column.tableName);
    where(usage.columnName).is(column.name);

    where(ref.constraintName).is(usage.constraintName);
    where(ref.constraintSchema).is(column.schema);
    where(ref.tableName).is(column.tableName);

    where(column.schema).is(schema);

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