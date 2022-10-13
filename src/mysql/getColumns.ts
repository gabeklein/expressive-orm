import Schema from '../connection/Schema';
import Query from '../query/Query';
import { Column, KeyColumnUsage, ReferentialConstraints } from './schema';

async function getColumns(schema: string){
  return Query.run(where => {
    const column = where(Column);

    const usage = where(KeyColumnUsage, "left", {
      tableSchema: column.schema,
      tableName: column.tableName,
      columnName: column.name
    });

    const ref = where(ReferentialConstraints, "left", {
      constraintName: usage.constraintName,
      constraintSchema: column.schema,
      tableName: column.tableName
    });

    where(column.schema).is(schema);

    return where.get((): Schema.Column => {
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
    })
  });
}

export default getColumns;