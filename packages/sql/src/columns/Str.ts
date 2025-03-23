import { Field } from '../type/Field';

class StringColumn extends Field<string> {
  readonly type!: Str.Type;
  readonly length?: number = 255;

  set(value: string) {
    if (typeof value !== 'string')
      throw 'Value must be a string.';

    if (this.length && value.length > this.length)
      throw `Value length ${value.length} exceeds maximum of ${this.length}.`;

    return value;
  }
}

declare namespace Str {
  interface Base extends StringColumn {}

  /**
   * Defines all available types of Str.
   * Each type is a different kind of string column.
   * SQL adapters will implement these types and add to interface using type as key.
   * "default" is what should be returned when no type is specified by `Str({ ... })`.
   * 
   * @example
   * declare module "@expressive/sql" {
   *   namespace Str {
   *     interface Types {
   *       default: Str.Text;
   *       varchar: Str.VarChar;
   *     }
   * 
   *     interface Text extends Str {
   *       readonly type: "text";
   *     }
   * 
   *     interface VarChar extends Str {
   *       readonly type: "varchar";
   *       readonly length: number;
   *     }
   *   }
   * }
   */
  interface Types {}

  /** All available types of Str */
  type Type = keyof Types;

  /** All available database types for Str */
  type Any = Types[keyof Types];

  type Opts = Partial<Any>;
}

interface Str extends Str.Base {}

function Str<T extends Str.Opts>(opts?: T){
  return new Str.Type(opts) as Field.Type<T, Str.Types>;
}

Str.Type = StringColumn;

export { Str }