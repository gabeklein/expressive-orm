import { def } from '@expressive/mvc';

import { Async, Config, Field, Nullable } from './Field';
import { type Type } from './Type';

export type Infer<T extends any[], Base> =
  T extends [infer First, ...infer Rest]
    ? First extends Nullable
      ? Base | undefined
      : Infer<Rest, Base>
    : Base;

const FIELDS = new WeakMap<Function, Map<string, Field>>();

function field<T>(create: (key: string, type: Type.Class) => Field) {
  return def((key, subject: Type, store: Record<string, unknown>) => {
    const type = subject.constructor as Type.Class;
    let fields = FIELDS.get(type);
    let load: (() => Async<unknown>) | undefined;
    let pending: Promise<unknown> | undefined;

    if (!fields)
      FIELDS.set(type, fields = new Map());

    if (!fields.has(key))
      fields.set(key, create(key, type));

    return {
      value: undefined,
      set(next: unknown) {
        if (typeof next == 'function') {
          load = next as () => Async<unknown>;
          pending = undefined;
          throw false;
        }

        load = undefined;
      },
      get() {
        if (!load)
          return store[key];

        throw pending ||= Promise.resolve(load()).then((value) => {
          (subject as any)[key] = value;
        });
      }
    };
  }) as T;
}

function column<T extends Config[], Base>(base: Config, ...config: T): Infer<T, Base> {
  return field((key) => new Field(key, base, ...config));
}

function str<T extends Config[]>(...config: T): Infer<T, string> {
  return column({ type: String }, ...config);
}

function num<T extends Config[]>(...config: T): Infer<T, number> {
  return column({
    type: Number,
    set: (value: number) => value,
    get: (value: string) => {
      return value != null ? parseFloat(value) : value;
    },
  }, ...config);
}

function bool<T extends Config[]>(...config: T): Infer<T, boolean> {
  return column({
    type: Boolean,
    set: (value: boolean) => value ? 1 : 0,
    get: (value: number) => value === undefined ? value : Boolean(value),
  }, ...config);
}

function date<T extends Config[]>(...config: T): Infer<T, Date> {
  return column({
    type: Date,
    set: (value: Date) => value ? new Date(value).toISOString() : undefined,
    get: (value: string) => value ? new Date(value) : undefined,
  }, ...config);
}

function uuid<T extends Config[]>(...config: T): Infer<T, string> {
  return column({ type: String }, ...config);
}

function json<T>(nullable: Nullable): T | undefined;
function json<T>(config?: Config): T;
function json<T>(config?: Config){
  return column({
    type: Object,
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config) as T;
}

const orNull = { nullable: true } as const;
const optional = { optional: true } as const;

export {
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
