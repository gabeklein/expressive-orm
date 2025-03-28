import { Field } from '../type/Field';

class TimeColumn extends Field<Date> {
  declare readonly type: Time.DataType;
  declare readonly fallback?: "NOW" | Date;

  readonly precision?: number;

  get(value: string | Date) {
    if (value instanceof Date)
      return value;
    return new Date(value.replace(/[-]/g, '/'));
  }

  set(value: string | Date): string | number {
    if (value === "NOW")
      return "CURRENT_TIMESTAMP";
    else if (value instanceof Date)
      return value.toISOString().slice(0, 19).replace("T", " ");
    else if (typeof value === "string")
      return value;
    else
      throw "Value must be a Date, string, or 'NOW'.";
  }
}

declare namespace Time {
  /**
   * Defines all available types of Time columns.
   * Each type represents a different way to store date/time values.
   * SQL adapters will implement these types and add to interface using type as key.
   * "default" is what should be returned when no type is specified by `Time({ ... })`.
   * 
   * @example
   * declare module "@expressive/sql" {
   *   namespace Time {
   *     interface Timestamp extends Time {
   *       readonly type: "timestamp";
   *       readonly precision?: number;
   *     }
   * 
   *     interface Types {
   *       default: Timestamp;
   *       timestamp: Timestamp;
   *     }
   *   }
   * }
   */
  interface Types {}

  /** All available type identifiers for Time */
  type DataType = keyof Types;

  /** All available database types for Time */
  type Any = Types[keyof Types] | TimeColumn;

  type Options = Field.Args<Any>;
}

type Time = Time.Any;

function Time<T extends Time.Options>(...opts: T){
  return Time.Type.new(...opts) as Field.Infer<T, Time.Types, Time>;
}

Time.Type = TimeColumn;

export { Time };