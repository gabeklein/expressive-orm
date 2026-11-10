import { now } from '@expressive/orm';

/**
 * Column datatypes, passed to a field helper - `str(sql.varchar(255))`, `date(sql.ms)`.
 *
 * Each fits only the helpers named on it; elsewhere it is a type error.
 */
const sql = {
  /** The current time - rendered by the database in the column's storage; statics take the app's clock. */
  now,
  /** `str` (default) - unbounded text. `date` - ISO 8601 text. `bool` - text, with `either`. */
  text: { type: "text" },
  /** `str` - a UUID. As `key(sql.uuid)`, a UUIDv7 is generated on insert when absent. */
  uuid: { type: "uuid" },
  /** `num`, `one` (default) - 32-bit integer; on `num` a fraction or a value out of range throws on write. `bool` - 1 or 0. `date` - epoch seconds. */
  integer: { type: "integer" },
  /** `num` - 16-bit integer; a fraction or a value out of range throws on write. */
  smallint: { type: "smallint" },
  /** `num`, `one` - 64-bit integer. On `num` a fraction throws on write. */
  bigint: { type: "bigint" },
  /** `num` - floating point. */
  real: { type: "real" },
  /** `num` - floating point. */
  float: { type: "float" },
  /** `num` - floating point, `double precision` in schema. */
  double: { type: "double" },
  /** `bool` (default). */
  boolean: { type: "boolean" },
  /** `date` (default) - date and time. */
  timestamp: { type: "timestamp" },
  /** `date` - a calendar day, `YYYY-MM-DD`. Written from the UTC day, read as local midnight. */
  date: { type: "date" },
  /** `date` - time of day, `HH:MM:SS` UTC, read on 1970-01-01. */
  time: { type: "time" },
  /** `date` - epoch milliseconds in a 64-bit integer. */
  ms: { type: "ms" },
  /** `date` - epoch seconds in an integer. */
  seconds: { type: "seconds" },
  /** `str` - text up to `length` characters; longer throws on write. `bool` - with `either`. */
  varchar: <N extends number>(length: N) => ({ type: "varchar", length }) as const,
  /** `str` - fixed-length text; longer than `length` throws on write. */
  char: <N extends number>(length: N) => ({ type: "char", length }) as const,
  /** `num` - exact decimal of `precision` digits, `scale` (default 0) after the point. A value past either throws on write. */
  numeric: (precision: number, scale = 0) => ({ type: "numeric", precision, scale }) as const,
  /** `num` - exact decimal, as `numeric`. */
  decimal: (precision: number, scale = 0) => ({ type: "decimal", precision, scale }) as const
} as const;

export { sql };
