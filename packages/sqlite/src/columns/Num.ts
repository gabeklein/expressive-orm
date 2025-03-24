import { Num } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Num {
    interface Integer extends NumericColumn {
      readonly type: "integer" | "smallint" | "bigint" | "serial";
    }
    
    interface Real extends NumericColumn {
      readonly type: "real" | "float" | "double" | "decimal" | "numeric";
    }
    
    interface Types {
      default: Integer;
      integer: Integer;
      smallint: Integer;
      bigint: Integer;
      serial: Integer;
      float: Real;
      double: Real;
      decimal: Real;
      numeric: Real;
      real: Real;
    }
  }
}

class NumericColumn extends Num.Type {
  get datatype(){
    let { type } = this;

    if (["smallint", "int", "bigint", "serial"].includes(type))
      return "integer";

    if (["float", "double", "decimal", "numeric"].includes(type))
      return "real";

    return type || "integer";
  }

  set(value: number) {
    if (typeof value !== 'number' || isNaN(value))
      throw `Got '${value}' but value must be a number.`;

    if (this.type === "integer" && value !== Math.floor(value))
      throw `Got '${value}' but datatype is integer.`;

    return value;
  }
}

Num.Type = NumericColumn;