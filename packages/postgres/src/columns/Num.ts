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

    interface Double extends NumericColumn {
      type: "double";
    }

    interface Numeric extends NumericColumn {
      type: "numeric";
      precision: number;
      scale: number;
    }

    interface Serial extends NumericColumn {
      type: "serial";
    }

    interface Types {
      default: Integer;
      integer: Integer;
      smallint: SmallInt;
      bigint: BigInt;
      real: Real;
      double: Double;
      numeric: Numeric;
      serial: Serial;
    }
  }
}

class NumericColumn extends num.Type {
  type: num.DataType = "integer";

  get datatype() {
    return this.type === "double" ? "double precision" : super.datatype;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (typeof value != "number")
      return out;

    switch (this.type) {
      case "smallint":
        if (value !== Math.floor(value) || value < -32768 || value > 32767)
          throw new Error(`Value ${value} out of range for smallint (-32768 to 32767).`);
        break;

      case "integer":
        if (value !== Math.floor(value) || value < -2147483648 || value > 2147483647)
          throw new Error(`Value ${value} out of range for integer (-2147483648 to 2147483647).`);
        break;

      case "bigint":
        if (value !== Math.floor(value))
          throw new Error(`Value ${value} must be an integer for bigint type.`);
        break;

      case "numeric":
        if (this.precision !== undefined) {
          const [whole, fraction = ""] = Math.abs(value).toString().split('.');

          if (whole.length + fraction.length > this.precision)
            throw new Error(`Value ${value} exceeds precision of ${this.precision}.`);

          if (this.scale !== undefined && fraction.length > this.scale)
            throw new Error(`Value ${value} exceeds scale of ${this.scale}.`);
        }
        break;
    }

    return out;
  }
}

num.Type = NumericColumn;
