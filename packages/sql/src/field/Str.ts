import { Field } from './Field';

declare namespace Str {
  type DataType =
    | "char"
    | "varchar"
    | "nchar"
    | "nvarchar"
    | "text"
    | "tinytext"
    | "mediumtext"
    | "longtext";

  interface Options extends Field.Options {
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

function Str<T extends string>(oneOf: Str.Specific<T> & Str.Nullable): T | null | undefined;
function Str<T extends string>(oneOf?: Str.Specific<T>): T;
function Str(column: string, nullable: true): string | null | undefined;
function Str(column: string, nullable?: boolean): string;
function Str(length: number, options: Str.Nullable): string | null | undefined;
function Str(length: number, options?: Str.Options): string;
function Str(options: Str.Nullable): string | null | undefined;
function Str(options?: Str.Options): string;
function Str(
  opts: number | Str.Options = {},
  arg2?: Str.Options | boolean): any {

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

  return Field.create({
    ...opts,
    accept: (x) => typeof x == "string",
    datatype: datatype.toUpperCase(),
    placeholder: ""
  });
}

export { Str }