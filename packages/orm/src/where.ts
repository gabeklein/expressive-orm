/** A filter operator and its value, from `equal`, `isIn` and the other operator helpers. */
class Where {
  skip?: boolean;

  constructor(public op?: string, public value?: any) {
    if (arguments.length > 1 && value === undefined)
      this.skip = true;
  }
}

/**
 * Match values equal to `value`.
 *
 * Given `undefined`, the condition is dropped - true of every operator taking a value.
 */
const equal = (value: any) => new Where('=', value);
/** Match values greater than `value`. */
const greaterThan = (value: any) => new Where('>', value);
/** Match values less than `value`. */
const lessThan = (value: any) => new Where('<', value);
/** Match values greater than or equal to `value`. */
const greaterThanOrEqual = (value: any) => new Where('>=', value);
/** Match values less than or equal to `value`. */
const lessThanOrEqual = (value: any) => new Where('<=', value);
/** Match values other than `value`. A missing value never matches. */
const notEqual = (value: any) => new Where('!=', value);
/**
 * Match text against a `LIKE` pattern - `%` any run, `_` one character.
 *
 * Compares the stored text, so it matches inside a `json()` column. Case-sensitive on `Memory.new()`; ASCII case-insensitive on SQLite.
 */
const isLike = (value: any) => new Where('LIKE', value);
/** Match a missing value. In a filter object `null` does the same. */
const isNull = () => new Where('IS NULL');
/** Match any present value. */
const notNull = () => new Where('IS NOT NULL');
/** Order by the property, ascending - alone, or in an array beside conditions. */
const asc = () => new Where('asc');
/** Order by the property, descending. */
const desc = () => new Where('desc');
/** Match any of `values`. An empty list matches nothing. */
const isIn = (values: any[]) => new Where('IN', values);
/**
 * Match none of `values`.
 *
 * An empty list matches every row on SQL; on `Memory.new()`, every row with a value.
 */
const notIn = (values: any[]) => new Where('NOT IN', values);

export {
  Where,
  equal,
  greaterThan,
  lessThan,
  greaterThanOrEqual,
  lessThanOrEqual,
  notEqual,
  isLike,
  isNull,
  notNull,
  isIn,
  notIn,
  asc,
  desc
}