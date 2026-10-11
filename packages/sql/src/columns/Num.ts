import { num } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace num {
    interface Integer extends NumericColumn {
      type: "integer";
    }

    interface SmallInt extends NumericColumn {
      type: "smallint";
    }

    interface BigInt extends NumericColumn {
      type: "bigint";
    }

    interface Real extends NumericColumn {
      type: "real";
    }

    interface Float extends NumericColumn {
      type: "float";
    }

    interface Double extends NumericColumn {
      type: "double";
    }

    interface Numeric extends NumericColumn {
      type: "numeric";
      precision: number;
      scale: number;
    }

    interface Decimal extends NumericColumn {
      type: "decimal";
      precision: number;
      scale: number;
    }

    interface Types {
      default: Integer;
      integer: Integer;
      smallint: SmallInt;
      bigint: BigInt;
      real: Real;
      float: Float;
      double: Double;
      numeric: Numeric;
      decimal: Decimal;
    }
  }
}

const RANGE: Record<string, [number, number]> = {
  smallint: [-32768, 32767],
  integer: [-2147483648, 2147483647],
  bigint: [-Infinity, Infinity]
};

export class NumericColumn extends num.Type {
  type: num.DataType = "integer";

  get datatype() {
    return this.type === "double" ? "double precision" : super.datatype;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (typeof value != "number")
      return out;

    const { type, precision, scale } = this;
    const range = RANGE[type];

    if (range) {
      const [min, max] = range;

      if (value !== Math.floor(value) || value < min || value > max)
        throw new Error(`Value ${value} out of range for ${type}.`);
    }
    else if (precision !== undefined) {
      const [whole, fraction = ""] = Math.abs(value).toString().split('.');

      if (whole.length + fraction.length > precision)
        throw new Error(`Value ${value} exceeds precision of ${precision}.`);

      if (scale !== undefined && fraction.length > scale)
        throw new Error(`Value ${value} exceeds scale of ${scale}.`);
    }

    return out;
  }
}

num.Type = NumericColumn;
