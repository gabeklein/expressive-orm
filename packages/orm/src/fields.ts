import { Config, Field, Nullable } from './Field';
import { type Type } from './Type';

export type Infer<T extends any[], Base> =
  T extends [infer First, ...infer Rest]
    ? First extends { nullable: true }
      ? Base | undefined
      : Infer<Rest, Base>
    : Base;

export type Instruction = <T extends Type>(key: string, parent: Type.Class<T>) => Field | void;

const USE = new Map<symbol, Instruction>();

function init<T extends Type>(type: Type.Class<T>) {
  const fields = new Map<string, Field>();
  const base = new (type as any)() as Type;

  for (const key in base) {
    const value = (base as any)[key];
    const instruction = USE.get(value);

    if (typeof instruction === 'function')
      USE.delete(value);
    else
      continue;

    const config = instruction(key, type);

    if (config)
      fields.set(key, config);
  }

  return fields;
}

function use<T>(cb: Instruction) {
  const symbol = Symbol();
  USE.set(symbol, cb);
  return symbol as unknown as T;
}

function column<T extends Config[], Base>(base: Config, ...config: T): Infer<T, Base> {
  return use((key) => new Field(key, base, ...config)) as Infer<T, Base>;
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
function json<T>(config?: Config): T {
  return column({
    type: Object,
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config);
}

export {
  Field,
  init,
  json,
  str,
  num,
  bool,
  date,
  uuid,
  use
}