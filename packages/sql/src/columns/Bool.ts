// packages/sql/src/columns/Bool.ts

import { Field } from '../type/Field';

class BooleanColumn extends Field<boolean> {
  readonly type!: Bool.DataType;
  readonly either?: readonly [true: string, false: string];

  get(value: unknown) {
    const [TRUE] = this.either || [1];
    return value === true || value === TRUE;
  }

  set(value: boolean) {
    const [TRUE, FALSE] = this.either || [1, 0];

    if (typeof value !== "boolean")
      throw "Value must be a boolean.";

    return value ? TRUE : FALSE;
  }
}

declare namespace Bool {
  /**
   * Defines all available types of boolean columns.
   * Each type represents a different way to store boolean values.
   * SQL adapters will implement these types and add to interface using type as key.
   * "default" is what should be returned when no type is specified by `Bool({ ... })`.
   * 
   * @example
   * declare module "@expressive/sql" {
   *   namespace Bool {
   *     interface Boolean extends Bool {
   *       readonly type: "boolean";
   *     }
   * 
   *     interface Types {
   *       default: Boolean;
   *       boolean: Boolean;
   *     }
   *   }
   * }
   */
  interface Types {}

  /** Base class for a Bool Field. */
  interface Type extends BooleanColumn {}

  /** All available type identifiers for Bool */
  type DataType = keyof Types;

  /** All available database types for Bool */
  type Any = Types[keyof Types] | Type;

  type Opts = Partial<Any>;
}

type Bool = Bool.Any;

function Bool<T extends Bool.Opts>(opts?: T){
  return Bool.Type.new(opts) as Field.Type<T, Bool.Types>;
}

Bool.Type = BooleanColumn;

export { Bool }