import Column from './Column';

declare namespace Number {
  type DataType =
    | "int"
    | "tinyint"
    | "smallint"
    | "bigint"
    | "float"
    | "double";

  interface Options extends Column.Options {
    datatype?: DataType;
  }

  type Nullable = Options & { nullable: true };
}

function Number(column: string, nullable: true): string | null | undefined;
function Number(column: string, nullable?: boolean): string;
function Number(options: Number.Nullable): number | null | undefined;
function Number(options?: Number.Options): number;
function Number(options: Number.Options | string = {}, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  const type = options.datatype || "int";

  return Column({
    datatype: type.toUpperCase(),
    placeholder: Infinity,
    nullable,
    ...options
  });
}

export default Number;