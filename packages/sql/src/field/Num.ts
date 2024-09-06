import { Field } from './Field';

declare namespace Num {
  type DataType =
    | "int"
    | "tinyint"
    | "smallint"
    | "bigint"
    | "float"
    | "double";

  interface Options extends Field.Options {
    datatype?: DataType;
  }

  type Nullable = Options & { nullable: true };
}

function Num(column: string, nullable: true): string | null | undefined;
function Num(column: string, nullable?: boolean): string;
function Num(options: Num.Nullable): number | null | undefined;
function Num(options?: Num.Options): number;
function Num(options: Num.Options | string = {}, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  const type = options.datatype || "int";

  return Field.create({
    datatype: type.toUpperCase(),
    placeholder: Infinity,
    nullable,
    ...options
  });
}

export { Num }