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

function Number(options: Number.Nullable): number | null | undefined;
function Number(options?: Number.Options): number;
function Number(options: Number.Options = {}){
  const type = options.datatype || "int";

  return Column({
    datatype: type.toUpperCase(),
    placeholder: Infinity,
    ...options
  });
}

export { Number }