import { Field } from '../Field';

declare namespace Str {
  type Type =
    | "char"
    | "varchar"
    | "nchar"
    | "nvarchar"
    | "text"
    | "tinytext"
    | "mediumtext"
    | "longtext";

  interface Specific<T extends string> extends Str {
    oneOf: T[];
  }

  interface OrNull extends Str {
    nullable: true;
  }
}

interface Str extends Field {
  datatype?: Str.Type;
  length?: number;
  oneOf?: any[];
  variable?: boolean;
}

function Str<T extends string>(oneOf: Str.Specific<T> & Str.OrNull): T | null | undefined;
function Str<T extends string>(oneOf?: Str.Specific<T>): T;
function Str(column: string, nullable: true): string | null | undefined;
function Str(column: string, nullable?: boolean): string;
function Str(length: number, options: Str.OrNull): string | null | undefined;
function Str(length: number, options?: Str): string;
function Str(options: Str.OrNull): string | null | undefined;
function Str(options?: Str): string;
function Str(
  opts: number | Str = {},
  arg2?: Str | boolean): any {

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

  const maxLength = opts.length || 255;
  let datatype: string = opts.datatype || "varchar";

  if(datatype && datatype.includes("char"))
    datatype = `${datatype}(${maxLength})`

  return Field({
    ...opts,
    set(value: unknown){
      if(typeof value !== "string")
        throw "Value must be a string."

      if(value.length > maxLength)
        throw `Value length ${value.length} exceeds maximum of ${maxLength}.`
    },
    datatype: datatype.toUpperCase()
  });
}

export { Str }