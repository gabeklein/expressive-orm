import { Field } from '../type/Field';

class NumericColumn extends Field<number> {
  readonly type!: Num.DataType;
  readonly precision?: number;
  readonly scale?: number;

  set(value: number) {
    if (typeof value !== 'number' || isNaN(value))
      throw `Got '${value}' but value must be a number.`;

    return value;
  }
}

declare namespace Num {
  /**
   * Defines all available types of numeric columns.
   * Each type represents a different kind of numeric data storage.
   * SQL adapters will implement these types and add to interface using type as key.
   * "default" is what should be returned when no type is specified by `Num({ ... })`.
   * 
   * @example
   * declare module "@expressive/sql" {
   *   namespace Num {
   *     interface Integer extends Num {
   *       readonly type: "integer";
   *     }
   * 
   *     interface Decimal extends Num {
   *       readonly type: "decimal";
   *       readonly precision: number;
   *       readonly scale: number;
   *     }
   * 
   *     interface Types {
   *       default: Integer;
   *       integer: Integer;
   *       decimal: Decimal;
   *     }
   *   }
   * }
   */
  interface Types {}

  interface Type extends NumericColumn {}

  /** All available type identifiers for Num */
  type DataType = keyof Types;

  /** All available database types for Num */
  type Any = Types[keyof Types] | Type;

  type Opts = Partial<Any>;
}

type Num = Num.Any;

function Num<T extends Num.Opts>(opts?: T){
  return Num.Type.new(opts) as Field.Type<T, Num.Types>;
}

Num.Type = NumericColumn;

export { Num }