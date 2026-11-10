import type { Builder } from './query/Builder';
import { now } from './query/Value';
import type { Query } from './query/Query';

export type Async<T> = T | Promise<T>;

export type Nullable<T extends Field = Field> = null | Partial<T> & { nullable: true }

export type Omissible =
  | { optional: true }
  | { increment: true }
  | { primary: true }
  | { fallback: {} | null };

export type Optional<T> = T & { readonly "~optional"?: true };

export type Fixed<T> = T & { readonly "~fixed"?: true };

export type Fixes<V> = "~fixed" extends keyof NonNullable<V> ? true : false;

export type Omits<V> =
  undefined extends V ? true :
  "~optional" extends keyof NonNullable<V> ? true :
  false;

export type Config<T = Field> = Partial<T> | null | undefined | false;

/**
 * A column's definition - what a field helper registers on its entity class.
 *
 * Drivers read it to build schema and to encode and decode values. Inside a `Query` it stands for the column.
 */
export class Field<T = unknown> {
  /** Property name on the entity. */
  key: string;
  /** Column name - the property in snake case unless `{ column }` is given. */
  column: string;
  /** Datatype name, from the helper's `Types`. */
  type = "";
  /** Constructor of the JS value - `String`, `Number`, `Boolean`, `Date` or `Object`. */
  kind?: unknown;
  length?: number;
  /** Accepts NULL, which reads as `undefined`. */
  nullable = false;
  /** May be left out of an insert. */
  optional = false;
  unique = false;
  /** `true`, or the index's name. */
  index: boolean | string = false;
  increment = false;
  primary = false;
  /** Has no column of its own - a composite key. */
  absent = false;
  /** Written by an insert that gives no value, and the column default in schema. `now` for the current time. */
  fallback?: unknown;
  /** Written on insert only - an update giving it throws, an upsert leaves it. */
  fixed = false;
  /** Written by every update or upsert not giving the column. A function is called once per write. */
  update?: unknown;
  /** For a relation, the related class's key field. */
  reference?: Field;
  /** Fields making up a composite key, in `key` order. */
  declare parts?: Field[];
  /** Entity class declaring the field. */
  parent?: Query.Table;
  /** In a `Query`, the table this copy of the field belongs to. */
  table?: Builder.ITable;
  /** In a `Query`, the builder this copy of the field belongs to. */
  query?: Builder;

  constructor(key: string, ...opts: Config[]) {
    this.key = key;
    this.column = underscore(key);
    configure(this, opts);
  }

  /** Datatype as schema renders it, size and options included. */
  get datatype() {
    return this.type;
  }

  /** Called when the property is first read in a `Query` - a relation joins its table here. */
  use?(query: Builder): unknown;

  /** Encode a value for storage, throwing when it does not fit. `compare` is set when encoding for a filter. */
  set(this: Field, value: any, compare?: boolean): Async<string | number | boolean | null | undefined> {
    return value;
  }

  /** Decode a stored value. `from` is the whole stored row. */
  get(this: Field, value: any, from?: Record<string, any>): Async<T | undefined> {
    return value;
  }

  /**
   * Encode this field out of `from`, by property, into `update`, by column.
   *
   * Applies the fallback, or with `partial` the `update` value. Throws for a missing required value, or for a fixed column given with `partial`.
   */
  async apply(update: Record<string, string>, from: Record<string, any>, partial?: boolean) {
    const { key, column, nullable, fixed } = this;
    let value = from[key];

    if (partial && fixed) {
      fixes(this, value);
      return;
    }

    if (value === undefined)
      value = partial ? updates(this) : this.fallback === "NOW" ? now : this.fallback;

    if (value === undefined && (nullable || partial || omits(this)))
      return;

    value = await this.set(present(value));

    if (value == null && !nullable)
      throw new Error(`Missing required field: ${key}`);

    update[column] = value ?? null;
  }
}

export function updates({ update }: Field) {
  return typeof update == "function" ? update() : update;
}

export function fixes(field: Field, value: unknown) {
  if (value !== undefined)
    throw new Error(`${field.key} is fixed and can't be updated.`);
}

export function present(value: unknown){
  return value === now ? new Date() : value;
}

export async function row(fields: Map<string, Field>, raw: Record<string, any>) {
  const values: Record<string, unknown> = {};

  for (const field of fields.values()) {
    const { key, reference } = field;
    const value = raw[field.column];

    values[key] = reference
      ? value == null ? undefined : await reference.get(value)
      : await field.get(value ?? undefined, raw);
  }

  return Object.freeze(values);
}

export function columns(primary: Field) {
  return primary.parts ? primary.parts.map(part => part.column) : [primary.column];
}

export function match(primary: Field, id: unknown): [string, string, unknown][] {
  return primary.parts
    ? primary.parts.map((part, i) => [part.column, "=", (id as unknown[])[i]])
    : [[primary.column, "=", id]];
}

export function identify(primary: Field, row: Record<string, any>) {
  return primary.parts ? Object.freeze(primary.parts.map(part => row[part.column])) : row[primary.column];
}

export function configure<F extends Field>(field: F, opts: Config<any>[]) {
  for (const opt of opts)
    if (opt === null)
      field.nullable = true;
    else if (typeof opt === 'object')
      Object.assign(field, opt);

  return field;
}

export function omits(field: Field) {
  return field.optional || field.increment || field.primary || field.fallback !== undefined;
}

export function underscore(str: string) {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
