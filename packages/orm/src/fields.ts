import { def } from '@expressive/mvc';

import { Config, configure, Field, Fixed, Nullable, Omissible, Optional } from './Field';
import { now } from './query/Value';
import { type Type } from './Type';

type Has<T extends any[], M> =
  T extends [infer First, ...infer Rest]
    ? First extends M ? true : Has<Rest, M>
    : false;

type Marked<T extends any[], Base> = Has<T, { fixed: true }> extends true ? Fixed<Base> : Base;

export type Infer<T extends any[], Base> =
  Has<T, Nullable> extends true ? Marked<T, Base> | undefined :
  Has<T, Omissible> extends true ? Optional<Marked<T, Base>> :
  Marked<T, Base>;

type DataTypes<Types> =
  [Exclude<keyof Types, "default">] extends [never] ? string : Exclude<keyof Types, "default">;

type OptionsOf<Types, Base> =
  | Config<Types extends { default: infer D } ? D : Base>
  | { [I in Exclude<keyof Types, "default">]: Partial<Types[I]> & { type: I } }[Exclude<keyof Types, "default">];

type Exact<T extends any[], Types> = {
  [K in keyof T]: T[K] extends { type: infer I extends keyof Types }
    ? T[K] & { [X in Exclude<keyof T[K], keyof Types[I]>]: never }
    : T[K]
};

declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

const FIELDS = new WeakMap<Function, Map<string, Field>>();
const PEEK = new WeakSet<Type>();

let PLACEHOLDER: Type | boolean = false;
let WRITING = false;

function placeholder<T extends Type>(create: () => T) {
  PLACEHOLDER = true;

  try {
    return write(create);
  }
  finally {
    PLACEHOLDER = false;
  }
}

function write<T>(apply: () => T) {
  const previous = WRITING;

  WRITING = true;

  try {
    return apply();
  }
  finally {
    WRITING = previous;
  }
}

function field<T, F extends Field = Field>(
  create: (key: string, type: Type.Class) => F,
  config?: (field: F, subject: Type, store: Record<string, unknown>) => def.Config
) {
  return def((key, subject: Type, store: Record<string, unknown>) => {
    const type = subject.constructor as Type.Class;
    let fields = FIELDS.get(type);

    if (!fields)
      FIELDS.set(type, fields = new Map());

    if (!fields.has(key)) {
      const field = create(key, type);

      for (const other of fields.values())
        if (other.column === field.column && !other.parts && !field.parts)
          throw new Error(`${type.name}.${other.key} and ${type.name}.${key} both use column ${field.column}.`);

      field.parent = type;
      fields.set(key, field);
    }

    if (PLACEHOLDER === true)
      PLACEHOLDER = subject;

    const output = config
      ? config(fields.get(key) as F, subject, store)
      : { value: undefined };

    if (PLACEHOLDER === subject)
      delete output.value;

    return {
      ...output,
      set(next: unknown, prev: unknown) {
        if (!WRITING)
          throw new Error(`${type.name}.${key} is read-only; use set().`);

        if (typeof output.set == "function")
          return output.set(next, prev);
      }
    };
  }) as T;
}

function column<T>(Type: new (key: string) => Field, ...config: Config<any>[]): T {
  return field((key) => configure(new Type(key), config));
}

class StringColumn extends Field<string> {
  declare type: str.DataType;
  declare collate?: string;

  get datatype() {
    let { type, length, collate } = this;

    if (type && length)
      type += `(${length})`;

    if (type && collate)
      type += ` COLLATE "${collate}"`;

    return type;
  }

  set(value: unknown) {
    if (value == null)
      return value;

    if (typeof value !== "string")
      throw new Error("Value must be a string.");

    if (this.length && value.length > this.length)
      throw new Error(`Value length ${value.length} exceeds maximum of ${this.length}.`);

    return value;
  }
}

declare namespace str {
  /**
   * Datatypes `str()` accepts, by name - augment to add one.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {}

  /** Name of a registered `str()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `str()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, StringColumn>;

  /** Column class behind `str()` - a package replaces it to add datatypes. */
  let Type: typeof StringColumn;
}

/**
 * A string column.
 *
 * Options in any order - `null` for nullable, `optional`, `unique`, `index`, a datatype from the driver package, or an object of column options.
 * Required on insert unless nullable or defaulted. A write throws for a non-string or one over `length`.
 *
 * @example
 * name = str(index);
 * bio = str(null, { column: "about" });
 */
function str<T extends str.Options[]>(...config: T & Exact<T, str.Types>): Infer<T, string> {
  return column(str.Type, { kind: String }, ...config);
}

str.Type = StringColumn;

/**
 * A string column.
 *
 * @deprecated Use `key(sql.uuid)` for an id, or `str(sql.uuid)` for a column.
 */
function uuid<T extends str.Options[]>(...config: T & Exact<T, str.Types>): Infer<T, string> {
  return column(str.Type, { kind: String }, ...config);
}

class NumericColumn extends Field<number> {
  declare type: num.DataType;
  declare precision?: number;
  declare scale?: number;

  get datatype() {
    let { type, precision, scale } = this;

    if (type && precision !== undefined)
      type += scale === undefined ? `(${precision})` : `(${precision},${scale})`;

    return type;
  }

  set(value: unknown) {
    if (value == null)
      return value;

    if (typeof value !== "number" || isNaN(value))
      throw new Error(`Got '${value}' but value must be a number.`);

    return value;
  }

  get(value: any) {
    return value != null ? parseFloat(value) : value;
  }
}

declare namespace num {
  /**
   * Datatypes `num()` accepts, by name - augment to add one.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {}

  /** Name of a registered `num()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `num()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, NumericColumn>;

  /** Column class behind `num()` - a package replaces it to add datatypes. */
  let Type: typeof NumericColumn;
}

/**
 * A number column - options as `str()`.
 *
 * A write throws for a non-number or `NaN`. The driver package sets the default datatype - with `@expressive/sql`, a 32-bit integer.
 */
function num<T extends num.Options[]>(...config: T & Exact<T, num.Types>): Infer<T, number> {
  return column(num.Type, { kind: Number }, ...config);
}

num.Type = NumericColumn;

class BooleanColumn extends Field<boolean> {
  declare type: bool.DataType;
  declare either?: readonly [true: string | number, false: string | number];

  set(value: unknown): string | number | boolean | null | undefined {
    if (value == null)
      return value;

    if (typeof value !== "boolean")
      throw new Error("Value must be a boolean.");

    const [TRUE, FALSE] = this.either || [1, 0];

    return value ? TRUE : FALSE;
  }

  get(value: unknown) {
    if (value === undefined)
      return value;

    const [TRUE] = this.either || [1];

    return value === true || value === TRUE;
  }
}

declare namespace bool {
  /**
   * Datatypes `bool()` accepts, by name - augment to add one.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {}

  /** Name of a registered `bool()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `bool()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, BooleanColumn>;

  /** Column class behind `bool()` - a package replaces it to add datatypes. */
  let Type: typeof BooleanColumn;
}

/**
 * A boolean column - options as `str()`.
 *
 * `{ either: [yes, no] }` stores those two values in place of true and false.
 */
function bool<T extends bool.Options[]>(...config: T & Exact<T, bool.Types>): Infer<T, boolean> {
  return column(bool.Type, { kind: Boolean }, ...config);
}

bool.Type = BooleanColumn;

class TimeColumn extends Field<Date> {
  declare type: date.DataType;
  declare precision?: number;

  get datatype() {
    let { type, precision } = this;

    if (type && precision !== undefined)
      type += `(${precision})`;

    return type;
  }

  set(value: unknown): string | number | undefined {
    if (!value)
      return undefined;

    const date = value instanceof Date || typeof value == "string" || typeof value == "number"
      ? new Date(value)
      : undefined;

    if (!date || isNaN(date.getTime()))
      throw new Error(`Got '${value}' but value must be a Date or date string.`);

    return date.toISOString();
  }

  get(value: any) {
    return value ? new Date(value) : undefined;
  }
}

declare namespace date {
  /**
   * Datatypes `date()` accepts, by name - augment to add one.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {}

  /** Name of a registered `date()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `date()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, TimeColumn>;

  /** Column class behind `date()` - a package replaces it to add datatypes. */
  let Type: typeof TimeColumn;

  /**
   * A Date column set to now on insert and never updated - `{ fallback: now, fixed: true }`.
   *
   * Upserts leave it. An update giving it fails to compile and throws.
   */
  let created: <T extends Options[]>(...config: T & Exact<T, Types>) => Infer<[...T, { fallback: {}, fixed: true }], Date>;

  /** A Date column set to now on insert and on every update or upsert not giving it - `{ fallback: now, update: now }`. */
  let updated: <T extends Options[]>(...config: T & Exact<T, Types>) => Infer<[...T, { fallback: {} }], Date>;
}

/**
 * A Date column - options as `str()`.
 *
 * A write takes a Date, a date string or epoch milliseconds, and throws for anything unparseable. `0` and `""` count as no value.
 */
function date<T extends date.Options[]>(...config: T & Exact<T, date.Types>): Infer<T, Date> {
  return column(date.Type, { kind: Date }, ...config);
}

date.Type = TimeColumn;

Object.assign(date, {
  created: (...config: date.Options[]) => column(date.Type, { kind: Date, fallback: now, fixed: true }, ...config),
  updated: (...config: date.Options[]) => column(date.Type, { kind: Date, fallback: now, update: now }, ...config)
});

/** A nullable JSON column - reads `T | undefined`. */
function json<T>(nullable: Nullable): T | undefined;
/**
 * A column holding `T` as JSON text.
 *
 * Takes one option, unlike the other helpers. Text that fails to parse reads `undefined`. `isLike` matches the stored text.
 *
 * @example
 * prefs = json<{ theme: string }>(null);
 */
function json<T>(config?: Config): T;
function json<T>(config?: Config){
  return column<T>(Field, {
    kind: Object,
    type: "text",
    set: (value: T) => value == null ? null : JSON.stringify(value),
    get: (value: string) => {
      try {
        return value ? JSON.parse(value) : undefined;
      }
      catch {
        return undefined;
      }
    },
  }, config);
}

/** A composite key's `id` - its parts as a JSON string, branded with their types. */
type Key<P> = string & { readonly "~key": P; readonly "~optional"?: true };

class KeyField extends Field<string> {
  absent = true;
  primary = true;

  async apply(){}

  async get(value: any, from?: Record<string, any>){
    if (!from)
      return JSON.stringify(value);

    const values = await Promise.all(this.parts!.map(part => (
      (part.reference || part).get(from[part.column], from)
    )));

    return JSON.stringify(values);
  }
}

function record(type: Type.Class, subject: Type, read: () => readonly unknown[]) {
  const keys = Array.from(type.fields.keys()).filter(key => key != "id");
  const saved = keys.map(key => [key, Object.getOwnPropertyDescriptor(subject, key)] as const);
  const marks = new Map(keys.map(key => [key, Symbol(key)]));
  const seen: string[] = [];
  let output: readonly unknown[] | undefined;

  for (const key of keys)
    Object.defineProperty(subject, key, {
      configurable: true,
      get: () => (seen.push(key), marks.get(key))
    });

  try {
    output = read();
  }
  catch {}
  finally {
    for (const [key, descriptor] of saved)
      Object.defineProperty(subject, key, descriptor!);
  }

  if (!output || output.length != seen.length || output.some((value, i) => value !== marks.get(seen[i])))
    throw new Error(`${type.name}.id must list fields to key by, like key(() => [this.a, this.b]).`);

  return seen.map(key => type.fields.get(key)!);
}

type KeyType<T extends any[]> =
  Has<T, { type: str.DataType }> extends true
    ? Has<T, { type: "uuid" }> extends true ? Optional<string> : string
    : Has<T, { increment: false }> extends true ? number : Optional<number>;

const INTEGER = new Set(["integer", "smallint", "bigint", "serial", "smallserial", "bigserial"]);
const NUMERIC = new Set([...INTEGER, "real", "float", "double", "numeric", "decimal"]);

/** An incrementing integer `id` - what every entity has by default. */
function key(): Optional<number>;
/**
 * A composite `id` over the fields the arrow lists.
 *
 * The arrow reads `this.<field>` only and runs lazily, so declare `id` above them. `id` has no column and reads as the parts in a JSON string.
 * Statics take that string or the tuple. It matches and orders by its parts - other operators throw. `one()` cannot relate to the class.
 *
 * @example
 * id = key(() => [this.account, this.role]);
 * account = one(Account);
 * role = str();
 */
function key<P extends readonly unknown[]>(read: () => readonly [...P]): Key<{ -readonly [I in keyof P]: P[I] extends Type | undefined ? NonNullable<P[I]>["id"] : P[I] }>;
/**
 * An `id` of the given datatype and options.
 *
 * An integer type increments; another numeric type does not. A string type is required on insert, except `uuid`, which generates a UUIDv7 when absent.
 * `{ column }` renames the column; the property stays `id`.
 *
 * @example
 * id = key(sql.uuid);
 */
function key<T extends (str.Options | num.Options)[]>(...config: T): KeyType<T>;
function key(...config: any[]): unknown {
  if (typeof config[0] == "function")
    return composite(config[0]);

  const type = config.reduce((type, opt) => opt && opt.type || type, undefined);
  const numeric = !type || NUMERIC.has(type);

  return field(key => {
    const column = configure(new (numeric ? num.Type : str.Type)(key), [
      { kind: numeric ? Number : String, primary: true, increment: !type || INTEGER.has(type) },
      ...config
    ]);

    if (!numeric) {
      const { apply } = column;

      column.apply = (update, from, partial) => {
        if (!partial && from[key] === undefined)
          if (type == "uuid")
            from = { ...from, [key]: uuidv7() };
          else
            throw new Error(`Missing required field: ${key}`);

        return apply.call(column, update, from, partial);
      };
    }

    return column;
  });
}

function uuidv7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Date.now();

  for (let i = 5; i >= 0; i--, time = Math.floor(time / 256))
    bytes[i] = time % 256;

  bytes[6] = bytes[6] & 0x0f | 0x70;
  bytes[8] = bytes[8] & 0x3f | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function composite<P extends readonly unknown[]>(read: () => readonly [...P]) {
  let first: Type;

  return field(
    (key, type) => {
      let parts: Field[] | undefined;

      return Object.defineProperty(new KeyField(key), "parts", {
        get: () => parts ||= record(type, first, read)
      });
    },
    (_field, subject) => {
      first ||= subject;

      return {
        value: undefined,
        get() {
          const peek = !PEEK.has(subject);

          if (peek)
            PEEK.add(subject);

          try {
            return JSON.stringify(read());
          }
          finally {
            if (peek)
              PEEK.delete(subject);
          }
        },
        set() {
          throw false;
        }
      };
    }
  );
}

/**
 * Modifier - the column is nullable.
 *
 * @deprecated Pass `null`, like `str(null)`.
 */
const orNull = { nullable: true } as const;
/** Modifier - the column may be left out of an insert, for a value the database fills. */
const optional = { optional: true } as const;
/** Modifier - the column is `UNIQUE`. */
const unique = { unique: true } as const;
/** Modifier - `sync` creates an index named `<table>_<column>`. `{ index: "name" }` names it. */
const index = { index: true } as const;

export type { DataTypes, Exact, Has, Key, OptionsOf };

export {
  FIELDS,
  PEEK,
  Field,
  placeholder,
  write,
  field,
  json,
  key,
  str,
  num,
  bool,
  date,
  uuid,
  orNull,
  optional,
  unique,
  index,
}
