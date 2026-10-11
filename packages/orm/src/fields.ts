import { def } from '@expressive/mvc';

import { Config, configure, Field, Nullable, Omissible, Optional } from './Field';
import { type Type } from './Type';

type Has<T extends any[], M> =
  T extends [infer First, ...infer Rest]
    ? First extends M ? true : Has<Rest, M>
    : false;

export type Infer<T extends any[], Base> =
  Has<T, Nullable> extends true ? Base | undefined :
  Has<T, Omissible> extends true ? Optional<Base> :
  Base;

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

const FIELDS = new WeakMap<Function, Map<string, Field>>();
const DIRTY = new WeakMap<Type, Record<string, unknown>>();

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

      field.parent = type;
      fields.set(key, field);
    }

    const output = config
      ? config(fields.get(key) as F, subject, store)
      : { value: undefined };

    return {
      ...output,
      set(next: unknown, prev: unknown) {
        let dirty = DIRTY.get(subject);

        if (!dirty)
          DIRTY.set(subject, dirty = {});

        dirty[key] = next;

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
  interface Types {}

  type DataType = DataTypes<Types>;

  type Options = OptionsOf<Types, StringColumn>;
}

function str<T extends str.Options[]>(...config: T & Exact<T, str.Types>): Infer<T, string> {
  return column(str.Type, { kind: String }, ...config);
}

str.Type = StringColumn;

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
  interface Types {}

  type DataType = DataTypes<Types>;

  type Options = OptionsOf<Types, NumericColumn>;
}

function num<T extends num.Options[]>(...config: T & Exact<T, num.Types>): Infer<T, number> {
  return column(num.Type, { kind: Number }, ...config);
}

num.Type = NumericColumn;

class BooleanColumn extends Field<boolean> {
  declare type: bool.DataType;
  declare either?: readonly [true: string | number, false: string | number];

  set(value: unknown) {
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
  interface Types {}

  type DataType = DataTypes<Types>;

  type Options = OptionsOf<Types, BooleanColumn>;
}

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
  interface Types {}

  type DataType = DataTypes<Types>;

  type Options = OptionsOf<Types, TimeColumn>;
}

function date<T extends date.Options[]>(...config: T & Exact<T, date.Types>): Infer<T, Date> {
  return column(date.Type, { kind: Date }, ...config);
}

date.Type = TimeColumn;

function json<T>(nullable: Nullable): T | undefined;
function json<T>(config?: Config): T;
function json<T>(config?: Config){
  return column<T>(Field, {
    kind: Object,
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config);
}

const orNull = { nullable: true } as const;
const optional = { optional: true } as const;

export type { DataTypes, Exact, Has, OptionsOf };

export {
  DIRTY,
  FIELDS,
  Field,
  field,
  json,
  str,
  num,
  bool,
  date,
  uuid,
  orNull,
  optional,
}
