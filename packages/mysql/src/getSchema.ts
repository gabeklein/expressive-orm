import { Schema, Query } from '@expressive/sql';

import { Column, KeyColumnUsage, ReferentialConstraints } from './infoSchema';

async function getSchema(name: string): Promise<Schema> {
  const tables = {} as { [name: string]: Schema.Table };
  const results = await getColumns(name);
  const columns = new Map<string, Schema.Column>();

  for(const result of results){
    const { tableName, ...field } = result;
    
    let table = tables[tableName];

    if(!table)
      table = tables[tableName] = {
        columns: {},
        name: tableName,
        schema: name
      };

    if(field.primary)
      table.primaryKeys = [field.name];

    table.columns[field.name] = field;
    columns.set(`${tableName}.${name}`, field);
  }

  return {
    name,
    tables,
    columns
  };
}

function getColumns(schema: string){
  return Query.get(where => {
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

    return () => {
      const {
        dataType,
        isNullable = false,
        name = "",
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
      let reference: Schema.FKConstraint | undefined;

      if(referencedTableName)
        reference = {
          table: referencedTableName,
          column: referencedColumnName!,
          name: constraintName,
          onDelete: deleteRule,
          onUpdate: updateRule
        };

      return {
        dataType,
        nullable: isNullable,
        primary: isPrimary,
        name,
        reference,
        type,
        tableName
      }
    }
  })
}

export { getSchema }