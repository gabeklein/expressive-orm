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

function column<T>(helper: Function, Type: new (key: string) => Field, ...config: Config<any>[]): T {
  return field((key) => configure(new Type(key), [{ helper }, ...config]));
}

/** A field helper with options preset - from `.and()`. Same signature; presets apply before the options given. */
interface Preset<Options, Types, Base, P extends any[]> {
  <T extends Options[]>(...config: T & Exact<T, Types>): Infer<[...P, ...T], Base>;
  /** Preset more options on top of these. */
  and<Q extends Options[]>(...preset: Q & Exact<Q, Types>): Preset<Options, Types, Base, [...P, ...Q]>;
  /** The helper it presets - a connection stores its fields as that helper's. */
  readonly base: Function;
}

function presets(base: Function, at = 0) {
  return (...preset: unknown[]) => derive(base, preset, at);
}

function derive(base: Function, preset: unknown[], at: number): Function {
  const helper = (...args: unknown[]) => base(...args.slice(0, at), ...preset, ...args.slice(at));

  return Object.assign(helper, {
    base,
    and: (...more: unknown[]) => derive(base, [...preset, ...more], at)
  });
}

class StringColumn extends Field<string> {
  declare type: str.DataType;
  declare collate?: string;

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
  /** Unbounded text - the default. */
  interface Text extends StringColumn {
    type: "text";
  }

  /** Text up to `length` characters. */
  interface VarChar extends StringColumn {
    type: "varchar";
    length: number;
  }

  /** Fixed-length text of `length` characters. */
  interface Char extends StringColumn {
    type: "char";
    length: number;
  }

  /** A UUID. As a `key`, a UUIDv7 is generated on insert when absent. */
  interface UUID extends StringColumn {
    type: "uuid";
  }

  /**
   * Portable datatypes `str()` accepts, by name - every connection maps them to its storage.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {
    default: Text;
    text: Text;
    varchar: VarChar;
    char: Char;
    uuid: UUID;
  }

  /** Name of a `str()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `str()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, StringColumn>;

  /**
   * `str` with options preset - same signature, presets first.
   *
   * @example
   * const email = str.and({ type: "varchar", length: 255 }, unique);
   */
  let and: <P extends Options[]>(...preset: P & Exact<P, Types>) => Preset<Options, Types, string, P>;
}

/**
 * A string column.
 *
 * Options in any order - `null` for nullable, `optional`, `unique`, `index`, a datatype, or an object of column options.
 * Required on insert unless nullable or defaulted. A write throws for a non-string or one over `length`.
 *
 * @example
 * name = str(index);
 * bio = str(null, { column: "about" });
 */
function str<T extends str.Options[]>(...config: T & Exact<T, str.Types>): Infer<T, string> {
  return column(str, StringColumn, { kind: String, type: "text" }, ...config);
}

str.and = presets(str) as typeof str.and;

/**
 * A string column.
 *
 * @deprecated Use `key({ type: "uuid" })` for an id, or `str({ type: "uuid" })` for a column.
 */
function uuid<T extends str.Options[]>(...config: T & Exact<T, str.Types>): Infer<T, string> {
  return column(str, StringColumn, { kind: String, type: "text" }, ...config);
}

const RANGE: Record<string, [number, number]> = {
  smallint: [-32768, 32767],
  integer: [-2147483648, 2147483647],
  bigint: [-Infinity, Infinity]
};

class NumericColumn extends Field<number> {
  declare type: num.DataType;
  declare precision?: number;
  declare scale?: number;

  set(value: unknown) {
    if (value == null)
      return value;

    if (typeof value !== "number" || isNaN(value))
      throw new Error(`Got '${value}' but value must be a number.`);

    const { type, precision, scale } = this;
    const range = RANGE[type];

    if (range) {
      const [min, max] = range;

      if (value !== Math.floor(value) || value < min || value > max)
        throw new Error(`Value ${value} out of range for ${type}.`);
    }
    else if (precision !== undefined) {
      const [whole, fraction = ""] = Math.abs(value).toString().split('.');

      if (whole.length + fraction.length > precision)
        throw new Error(`Value ${value} exceeds precision of ${precision}.`);

      if (scale !== undefined && fraction.length > scale)
        throw new Error(`Value ${value} exceeds scale of ${scale}.`);
    }

    return value;
  }
}

declare namespace num {
  /** 32-bit integer - the default. A fraction or a value out of range throws on write. */
  interface Integer extends NumericColumn {
    type: "integer";
  }

  /** 16-bit integer. A fraction or a value out of range throws on write. */
  interface SmallInt extends NumericColumn {
    type: "smallint";
  }

  /** 64-bit integer. A fraction throws on write. */
  interface BigInt extends NumericColumn {
    type: "bigint";
  }

  /** Single-precision floating point. */
  interface Real extends NumericColumn {
    type: "real";
  }

  /** Double-precision floating point. */
  interface Double extends NumericColumn {
    type: "double";
  }

  /** Exact decimal of `precision` digits, `scale` after the point. A value past either throws on write. */
  interface Decimal extends NumericColumn {
    type: "decimal";
    precision: number;
    scale: number;
  }

  /** Exact decimal, as `decimal`. */
  interface Numeric extends NumericColumn {
    type: "numeric";
    precision: number;
    scale: number;
  }

  /**
   * Portable datatypes `num()` accepts, by name - every connection maps them to its storage.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {
    default: Integer;
    integer: Integer;
    smallint: SmallInt;
    bigint: BigInt;
    real: Real;
    double: Double;
    decimal: Decimal;
    numeric: Numeric;
  }

  /** Name of a `num()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `num()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, NumericColumn>;

  /** `num` with options preset - same signature, presets first. */
  let and: <P extends Options[]>(...preset: P & Exact<P, Types>) => Preset<Options, Types, number, P>;
}

/**
 * A number column - options as `str()`.
 *
 * A 32-bit integer unless another datatype is given. A write throws for a non-number, `NaN`, a value outside an integer type, or past a decimal's precision or scale.
 */
function num<T extends num.Options[]>(...config: T & Exact<T, num.Types>): Infer<T, number> {
  return column(num, NumericColumn, { kind: Number, type: "integer" }, ...config);
}

num.and = presets(num) as typeof num.and;

class BooleanColumn extends Field<boolean> {
  declare type: bool.DataType;

  set(value: unknown) {
    if (value == null)
      return value;

    if (typeof value !== "boolean")
      throw new Error("Value must be a boolean.");

    return value;
  }
}

declare namespace bool {
  /** True or false - the default. */
  interface Boolean extends BooleanColumn {
    type: "boolean";
  }

  /**
   * Portable datatypes `bool()` accepts, by name.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {
    default: Boolean;
    boolean: Boolean;
  }

  /** Name of a `bool()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `bool()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, BooleanColumn>;

  /** `bool` with options preset - same signature, presets first. */
  let and: <P extends Options[]>(...preset: P & Exact<P, Types>) => Preset<Options, Types, boolean, P>;
}

/** A boolean column - options as `str()`. A write throws for a non-boolean. */
function bool<T extends bool.Options[]>(...config: T & Exact<T, bool.Types>): Infer<T, boolean> {
  return column(bool, BooleanColumn, { kind: Boolean, type: "boolean" }, ...config);
}

bool.and = presets(bool) as typeof bool.and;

const DAY = /^(\d{4})-(\d\d)-(\d\d)/;

class TimeColumn extends Field<Date> {
  declare type: date.DataType;
  declare precision?: number;

  set(value: unknown): Date | string | undefined {
    if (!value)
      return undefined;

    const date = value instanceof Date || typeof value == "string" || typeof value == "number"
      ? this.parse(value)
      : undefined;

    if (!date || isNaN(date.getTime()))
      throw new Error(`Got '${value}' but value must be a Date or date string.`);

    return this.type === "date" ? day(date) : date;
  }

  get(value: unknown) {
    return value == null || value instanceof Date ? value ?? undefined : this.parse(value as string);
  }

  private parse(value: string | number | Date){
    const day = this.type === "date" && typeof value == "string" && DAY.exec(value);
    return day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(value);
  }
}

function day(date: Date){
  const pad = (part: number, size = 2) => String(part).padStart(size, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Created = { readonly fallback: typeof now; readonly fixed: true };
type Updated = { readonly fallback: typeof now; readonly update: typeof now };

declare namespace date {
  /** Date and time - the default. `timezone` keeps the offset where the store can. */
  interface Timestamp extends TimeColumn {
    type: "timestamp";
    timezone?: boolean;
  }

  /**
   * A calendar day, not an instant - read as local midnight.
   *
   * A Date gives its local day; a `YYYY-MM-DD` string is that day. It reaches a connection as `YYYY-MM-DD`, so each side reads it in its own time zone.
   */
  interface Day extends TimeColumn {
    type: "date";
  }

  /** Time of day, read on 1970-01-01. `timezone` keeps the offset where the store can. */
  interface Time extends TimeColumn {
    type: "time";
    timezone?: boolean;
  }

  /**
   * Portable datatypes `date()` accepts, by name - every connection maps them to its storage.
   *
   * `default` is the datatype used when none is given, and types a plain options object.
   */
  interface Types {
    default: Timestamp;
    timestamp: Timestamp;
    date: Day;
    time: Time;
  }

  /** Name of a `date()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `date()` - `null`, a modifier, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, TimeColumn>;

  /** `date` with options preset - same signature, presets first. */
  let and: <P extends Options[]>(...preset: P & Exact<P, Types>) => Preset<Options, Types, Date, P>;

  /**
   * A Date column set to now on insert and never updated - `date.and({ fallback: now, fixed: true })`.
   *
   * Upserts leave it. An update giving it fails to compile and throws.
   */
  let created: Preset<Options, Types, Date, [Created]>;

  /**
   * A Date column set to now on insert and on every update or upsert not giving it.
   *
   * Underneath, `date.and({ fallback: now, update: now })`.
   */
  let updated: Preset<Options, Types, Date, [Updated]>;
}

/**
 * A Date column - options as `str()`.
 *
 * A write takes a Date, a date string or epoch milliseconds, and throws for anything unparseable. `0` and `""` count as no value.
 */
function date<T extends date.Options[]>(...config: T & Exact<T, date.Types>): Infer<T, Date> {
  return column(date, TimeColumn, { kind: Date, type: "timestamp" }, ...config);
}

date.and = presets(date) as typeof date.and;
date.created = date.and({ fallback: now, fixed: true }) as typeof date.created;
date.updated = date.and({ fallback: now, update: now }) as typeof date.updated;

declare namespace json {
  /** `json` with options preset. */
  let and: (...preset: Config[]) => typeof json;
}

/** A nullable JSON column - reads `T | undefined`. */
function json<T>(nullable: Nullable): T | undefined;
/**
 * A column holding `T` as JSON.
 *
 * Takes one option, unlike the other helpers. A stored value that fails to parse reads `undefined`. `isLike` matches the stored text.
 *
 * @example
 * prefs = json<{ theme: string }>();
 */
function json<T>(config?: Config): T;
function json<T>(...config: Config[]){
  return column<T>(json, Field, {
    kind: Object,
    type: "json",
    set: (value: T) => value ?? null,
    get: (value: T) => value ?? undefined
  }, ...config);
}

json.and = presets(json) as typeof json.and;

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

const INTEGER = new Set(["integer", "smallint", "bigint"]);
const NUMERIC = new Set([...INTEGER, "real", "double", "numeric", "decimal"]);

/** An incrementing integer `id` - what every entity has by default. */
function key(): Optional<number>;
/**
 * A composite `id` over the fields the arrow lists.
 *
 * The arrow reads `this.<field>` only and runs lazily, so `id` can stay on top. `id` has no column and reads as the parts in a JSON string.
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
 * id = key({ type: "uuid" });
 */
function key<T extends (str.Options | num.Options)[]>(...config: T): KeyType<T>;
function key(...config: any[]): unknown {
  if (typeof config[0] == "function")
    return composite(config[0]);

  const type = config.reduce((type, opt) => opt && opt.type || type, undefined);
  const numeric = !type || NUMERIC.has(type);

  return field(key => {
    const column = configure(new (numeric ? NumericColumn : StringColumn)(key), [
      { helper: numeric ? num : str, kind: numeric ? Number : String, type: numeric ? "integer" : "text", primary: true, increment: !type || INTEGER.has(type) },
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

export type { DataTypes, Exact, Has, Key, OptionsOf, Preset };

export {
  FIELDS,
  PEEK,
  Field,
  placeholder,
  write,
  field,
  presets,
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
