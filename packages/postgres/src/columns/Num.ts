// postgres/src/columns/Num.ts
import { Num } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Num {
    interface Integer extends NumericColumn {
      readonly type: "integer";
    }
    
    interface SmallInt extends NumericColumn {
      readonly type: "smallint";
    }
    
    interface BigInt extends NumericColumn {
      readonly type: "bigint";
    }
    
    interface Real extends NumericColumn {
      readonly type: "real";
    }
    
    interface Double extends NumericColumn {
      readonly type: "double";
    }
    
    interface Numeric extends NumericColumn {
      readonly type: "numeric";
      readonly precision: number;
      readonly scale: number;
    }
    
    interface Serial extends NumericColumn {
      readonly type: "serial";
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

class NumericColumn extends Num.Type {
  type: Num.DataType = "integer";
  
  get datatype() {
    const { type, precision, scale } = this;

    if(type === "double")
      return "double precision";

    if(type !== "numeric" || precision === undefined)
      return type;

    if(scale !== undefined)
      return `numeric(${precision},${scale})`;

    return `numeric(${precision})`;
  }

  set(value: number) {
    if (typeof value !== 'number' || isNaN(value))
      throw `Got '${value}' but value must be a number.`;

    // Type-specific validation
    switch (this.type) {
      case "smallint":
        if (value !== Math.floor(value) || value < -32768 || value > 32767)
          throw `Value ${value} out of range for smallint (-32768 to 32767).`;
        break;
      
      case "integer":
        if (value !== Math.floor(value) || value < -2147483648 || value > 2147483647)
          throw `Value ${value} out of range for integer (-2147483648 to 2147483647).`;
        break;
      
      case "bigint":
        if (value !== Math.floor(value))
          throw `Value ${value} must be an integer for bigint type.`;
        break;
      
      case "numeric":
        if (this.precision !== undefined) {
          const str = value.toString();
          const parts = str.split('.');
          
          // Check precision (total digits)
          const totalDigits = parts[0].replace('-', '').length + (parts[1]?.length || 0);
          if (totalDigits > this.precision)
            throw `Value ${value} exceeds precision of ${this.precision}.`;
          
          // Check scale (decimal digits)
          if (this.scale !== undefined && parts[1] && parts[1].length > this.scale)
            throw `Value ${value} exceeds scale of ${this.scale}.`;
        }
        break;
    }

    return value;
  }
}

Num.Type = NumericColumn;