import { now } from '@expressive/orm';

interface Datatypes {
  /** The current time - rendered by the database in the column's storage; statics take the app's clock. */
  readonly now: typeof now;
  /** `str` (default) - unbounded text. `date` - ISO 8601 text. `bool` - text, with `either`. */
  readonly text: { readonly type: "text" };
  /** `str` - a UUID. As `key(sql.uuid)`, a UUIDv7 is generated on insert when absent. */
  readonly uuid: { readonly type: "uuid" };
  /** `num`, `one` (default) - 32-bit integer; on `num` a fraction or a value out of range throws on write. `bool` - 1 or 0. `date` - epoch seconds. */
  readonly integer: { readonly type: "integer" };
  /** `num` - 16-bit integer; a fraction or a value out of range throws on write. */
  readonly smallint: { readonly type: "smallint" };
  /** `num`, `one` - 64-bit integer. On `num` a fraction throws on write. */
  readonly bigint: { readonly type: "bigint" };
  /** `num` - floating point. */
  readonly real: { readonly type: "real" };
  /** `num` - floating point. */
  readonly float: { readonly type: "float" };
  /** `num` - floating point, `double precision` in schema. */
  readonly double: { readonly type: "double" };
  /** `bool` (default). */
  readonly boolean: { readonly type: "boolean" };
  /** `date` (default) - date and time. */
  readonly timestamp: { readonly type: "timestamp" };
  /** `date` - a calendar day, `YYYY-MM-DD`. Written from the UTC day, read as local midnight. */
  readonly date: { readonly type: "date" };
  /** `date` - time of day, `HH:MM:SS` UTC, read on 1970-01-01. */
  readonly time: { readonly type: "time" };
  /** `date` - epoch milliseconds in a 64-bit integer. */
  readonly ms: { readonly type: "ms" };
  /** `date` - epoch seconds in an integer. */
  readonly seconds: { readonly type: "seconds" };
  /** `str` - text up to `length` characters; longer throws on write. `bool` - with `either`. */
  readonly varchar: <N extends number>(length: N) => { readonly type: "varchar"; readonly length: N };
  /** `str` - fixed-length text; longer than `length` throws on write. */
  readonly char: <N extends number>(length: N) => { readonly type: "char"; readonly length: N };
  /** `num` - exact decimal of `precision` digits, `scale` (default 0) after the point. A value past either throws on write. */
  readonly numeric: (precision: number, scale?: number) => { readonly type: "numeric"; readonly precision: number; readonly scale: number };
  /** `num` - exact decimal, as `numeric`. */
  readonly decimal: (precision: number, scale?: number) => { readonly type: "decimal"; readonly precision: number; readonly scale: number };
}

/**
 * Column datatypes, passed to a field helper - `str(sql.varchar(255))`, `date(sql.ms)`.
 *
 * Each fits only the helpers named on it; elsewhere it is a type error.
 */
const sql: Datatypes = {
  now,
  text: { type: "text" },
  uuid: { type: "uuid" },
  integer: { type: "integer" },
  smallint: { type: "smallint" },
  bigint: { type: "bigint" },
  real: { type: "real" },
  float: { type: "float" },
  double: { type: "double" },
  boolean: { type: "boolean" },
  timestamp: { type: "timestamp" },
  date: { type: "date" },
  time: { type: "time" },
  ms: { type: "ms" },
  seconds: { type: "seconds" },
  varchar: <N extends number>(length: N) => ({ type: "varchar", length }) as const,
  char: <N extends number>(length: N) => ({ type: "char", length }) as const,
  numeric: (precision: number, scale = 0) => ({ type: "numeric", precision, scale }) as const,
  decimal: (precision: number, scale = 0) => ({ type: "decimal", precision, scale }) as const
};

export { sql };
