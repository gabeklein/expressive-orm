import { Field } from './Field';
import { Table } from './Table';

class PrimaryColumn extends Field<number> {
  readonly type: string = "integer";
  readonly nullable = false;
  readonly optional = true;
  readonly primary = true;
  readonly unique = true;

  readonly increment: boolean = true;

  readonly tableName?: string | ((self: Table.Type) => string);
  readonly tableSchema?: string | ((self: Table.Type) => string);
  readonly columnName?: (property: string, column: Field, self: Table.Type) => string;

  init(property: string, parent: Table.Type){
    const { tableName, tableSchema, columnName } = this;

    if(tableName)
      parent.table = typeof tableName == "function"
        ? tableName(parent)
        : tableName;

    if(tableSchema)
      parent.schema = typeof tableSchema == "function"
        ? tableSchema(parent)
        : tableSchema;

    if(columnName)
      parent.fields.forEach((field, property) => {
        field.column = columnName(property, field, parent);
      });
  }
}

declare namespace Primary {
  type Options = Field.Args<PrimaryColumn>;
}

function Primary<A extends Primary.Options>(...opts: A){
  return PrimaryColumn.new(...opts) as Field.Infer<A, {}, PrimaryColumn>;
}

export { Primary }