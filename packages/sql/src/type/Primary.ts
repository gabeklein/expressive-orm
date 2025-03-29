import { Field } from './Field';
import { Table } from './Table';

class PrimaryColumn extends Field<number> {
  readonly type = "integer";
  readonly nullable = false;
  readonly optional = true;
  readonly primary = true;
  readonly unique = true;

  readonly increment: boolean = true;

  readonly tableName?: string | ((self: Table.Type) => string);
  readonly tableSchema?: string | ((self: Table.Type) => string);;

  create(property: string, parent: Table.Type){
    const { tableName, tableSchema } = this;

    if(tableName)
      parent.table = typeof tableName == "function"
        ? tableName(parent)
        : tableName;

    if(tableSchema)
      parent.schema = typeof tableSchema == "function"
        ? tableSchema(parent)
        : tableSchema;

    return super.create(property, parent) as this;
  }
}

declare namespace Primary {
  type Options = Field.Args<PrimaryColumn>;
}

function Primary<A extends Primary.Options>(...opts: A){
  return PrimaryColumn.new(...opts) as Field.Infer<A, {}, PrimaryColumn>;
}

export { Primary }