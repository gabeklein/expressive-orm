import { def } from '@expressive/mvc';

import { Config, Field, Nullable } from './Field';
import { type Type } from './Type';

export type Infer<T extends any[], Base> =
  T extends [infer First, ...infer Rest]
    ? First extends Nullable
      ? Base | undefined
      : Infer<Rest, Base>
    : Base;

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

function column<T extends Config[], Base>(base: Config, ...config: T): Infer<T, Base> {
  return field((key) => new Field(key, base, ...config));
}

function str<T extends Config[]>(...config: T): Infer<T, string> {
  return column({ kind: String }, ...config);
}

function num<T extends Config[]>(...config: T): Infer<T, number> {
  return column({
    kind: Number,
    set: (value: number) => value,
    get: (value: string) => {
      return value != null ? parseFloat(value) : value;
    },
  }, ...config);
}

function bool<T extends Config[]>(...config: T): Infer<T, boolean> {
  return column({
    kind: Boolean,
    set: (value: boolean) => value ? 1 : 0,
    get: (value: number) => value === undefined ? value : Boolean(value),
  }, ...config);
}

function date<T extends Config[]>(...config: T): Infer<T, Date> {
  return column({
    kind: Date,
    set: (value: Date) => value ? new Date(value).toISOString() : undefined,
    get: (value: string) => value ? new Date(value) : undefined,
  }, ...config);
}

function uuid<T extends Config[]>(...config: T): Infer<T, string> {
  return column({ kind: String }, ...config);
}

function json<T>(nullable: Nullable): T | undefined;
function json<T>(config?: Config): T;
function json<T>(config?: Config){
  return column({
    kind: Object,
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config) as T;
}

const orNull = { nullable: true } as const;
const optional = { optional: true } as const;

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
