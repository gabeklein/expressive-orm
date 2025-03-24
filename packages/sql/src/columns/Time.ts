import { Field } from '../type/Field';

class TimeColumn extends Field<Date> {
  readonly type!: Time.DataType;
  readonly precision?: number;
  readonly fallback?: "NOW" | Date;

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

  /** Base class for a Time Field. */
  interface Type extends TimeColumn {}

  /** All available type identifiers for Time */
  type DataType = keyof Types;

  /** All available database types for Time */
  type Any = Types[keyof Types] | Type;

  type Options = Partial<Any>;
}

type Time = Time.Any;

function Time<T extends Time.Options>(opts?: T){
  return Time.Type.new(opts) as Field.Type<T, Time.Types>;
}

Time.Type = TimeColumn;

export { Time };