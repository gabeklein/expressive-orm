import { Field } from '../Field';

declare namespace Num {
  type Type =
    | "int"
    | "tinyint"
    | "smallint"
    | "bigint"
    | "float"
    | "double";

  interface OrNull extends Num {
    nullable: true;
  }
}

interface Num extends Field {
  datatype?: Num.Type;
}

function Num(options: Num.OrNull): number | null | undefined;
function Num(options?: Num): number;
function Num(options: Num | string = {}, nullable?: boolean){
  if(typeof options == "string")
    options = { column: options };

  const type = options.datatype || "int";

  return Field({
    datatype: type,
    set: (value: unknown) => {
      if(typeof value !== "number" || isNaN(value))
        throw `Got '${value}' but value must be a number.`

      if(type === "int" && value !== Math.floor(value))
        throw `Got '${value}' but selected datatype is INT.`
    },
    nullable,
    ...options
  });
}

export { Num }