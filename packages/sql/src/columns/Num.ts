import { Field } from '../Field';

declare namespace Num {
  interface Int extends Numeric {
    readonly type: "int";
  }
  
  interface TinyInt extends Numeric {
    readonly type: "tinyint";
  }
  
  interface SmallInt extends Numeric {
    readonly type: "smallint";
  }
  
  interface BigInt extends Numeric {
    readonly type: "bigint";
  }
  
  interface Float extends Numeric {
    readonly type: "float";
  }
  
  interface Double extends Numeric {
    readonly type: "double";
  }

  type Type = Int | TinyInt | SmallInt | BigInt | Float | Double;

  type Options = Partial<Type>;
}

function Num<T extends Num.Options>(options?: T){
  return Numeric.new(options) as Field.Specify<T, Num.Type, Num.Int>;
}

class Numeric extends Field<number> {
  type: Num.Type["type"] = "int";

  set(value: number){
    super.set(value);

    if(typeof value !== "number" || isNaN(value))
      throw `Got '${value}' but value must be a number.`

    if(this.type === "int" && value !== Math.floor(value))
      throw `Got '${value}' but datatype is integer.`
  }
}

export { Num, Numeric };