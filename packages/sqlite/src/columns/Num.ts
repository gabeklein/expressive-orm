import { num } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace num {
    interface Integer extends NumericColumn {
      type: "integer" | "smallint" | "bigint" | "serial";
    }

    interface Real extends NumericColumn {
      type: "real" | "float" | "double" | "decimal" | "numeric";
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

class NumericColumn extends num.Type {
  type: num.DataType = "integer";

  get datatype(){
    const { type } = this;

    if (["smallint", "bigint", "serial"].includes(type))
      return "integer";

    if (["float", "double", "decimal", "numeric"].includes(type))
      return "real";

    return type;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (typeof value == "number" && this.datatype == "integer" && value !== Math.floor(value))
      throw new Error(`Got '${value}' but datatype is integer.`);

    return out;
  }
}

num.Type = NumericColumn;
