import { Field } from '../type/Field';

class NumericColumn extends Field<number> {
  readonly type: "int" | "tinyint" | "smallint" | "bigint" | "float" | "double" = "int";

  set(value: number) {
    if (typeof value !== "number" || isNaN(value))
      throw `Got '${value}' but value must be a number.`;

    if (this.type === "int" && value !== Math.floor(value))
      throw `Got '${value}' but datatype is integer.`;

    return value;
  }
}

declare namespace Num {
  interface Int extends Num {
    readonly type: "int";
  }
  
  interface TinyInt extends Num {
    readonly type: "tinyint";
  }
  
  interface SmallInt extends Num {
    readonly type: "smallint";
  }
  
  interface BigInt extends Num {
    readonly type: "bigint";
  }
  
  interface Float extends Num {
    readonly type: "float";
  }
  
  interface Double extends Num {
    readonly type: "double";
  }

  type Type = Int | TinyInt | SmallInt | BigInt | Float | Double;
  type Options = Partial<Type>;
}

interface Num extends NumericColumn {}

function Num<T extends Num.Options>(opts?: T){
  return new NumericColumn(opts) as Field.Specify<T, Num.Type, Num.Int>;
}

Num.Type = NumericColumn;

export { Num };