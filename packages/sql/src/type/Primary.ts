import { Field } from "./Field";
import { Type } from "./Type";

class PrimaryColumn extends Field<number> {
  readonly type = "integer";
  readonly optional = false;
  readonly nullable = false;
  readonly primary = true;
  readonly unique = true;

  readonly increment: boolean = true;

  readonly tableName?: string | ((self: Type.EntityType) => string);
  readonly tableSchema?: string | ((self: Type.EntityType) => string);;

  create(property: string, parent: Type.EntityType){
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