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

function Str(options: Str.OrNull): Str.OrNull;
function Str(options?: Str): Str;
function Str(opts: Str = {}){
  const maxLength = opts.length || 255;

  let datatype: string = opts.datatype || "varchar";

  if(datatype && datatype.includes("char"))
    datatype = `${datatype}(${maxLength})`

  return Field({
    ...opts,
    datatype: datatype.toLowerCase(),
    set(value: unknown){
      if(typeof value !== "string")
        throw "Value must be a string."

      if(value.length > maxLength)
        throw `Value length ${value.length} exceeds maximum of ${maxLength}.`
    }
  });
}

export { Str }