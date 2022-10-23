import Column from './Column';

declare namespace String {
  type DataType =
    | "char"
    | "varchar"
    | "nchar"
    | "nvarchar"
    | "text"
    | "tinytext"
    | "mediumtext"
    | "longtext";

  interface Options extends Column.Options {
    datatype?: DataType;
    length?: number;
    oneOf?: any[];
    variable?: boolean;
  }

  interface Specific<T extends string> extends Options {
    oneOf: T[];
  }

  type Nullable = Options & { nullable: true };
}

function String<T extends string>(oneOf: String.Specific<T> & String.Nullable): T | null | undefined;
function String<T extends string>(oneOf?: String.Specific<T>): T;
function String(column: string, nullable: true): string | null | undefined;
function String(column: string, nullable?: boolean): string;
function String(length: number, options: String.Nullable): string | null | undefined;
function String(length: number, options?: String.Options): string;
function String(options: String.Nullable): string | null | undefined;
function String(options?: String.Options): string;
function String(
  opts: number | String.Options = {},
  arg2?: String.Options | boolean): any {

  switch(typeof opts){
    case "number":
      opts = { length: opts };
    break;

    case "string":
      opts = { column: opts };
    break;
  }

  switch(typeof arg2){
    case "object":
      Object.assign(opts, arg2);
    break;

    case "boolean":
      opts.nullable = arg2;
    break;
  }

  let datatype: string = opts.datatype || "varchar";

  if(datatype && datatype.includes("char"))
    datatype = `${datatype}(${opts.length || 255})`

  return Column({
    ...opts,
    datatype: datatype.toUpperCase(),
    placeholder: ""
  });
}

export default String;