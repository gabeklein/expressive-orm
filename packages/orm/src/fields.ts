import { Config, Field, Nullable } from './Field';
import { type Type } from './Type';

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

function column<T>(...config: Config[]): T {
  return use((key) => new Field(key, ...config));
}

function str(nullable: Nullable): string | undefined;
function str(config?: Config): string;
function str(config?: Config | null) {
  return column({ type: String }, config);
}

function num(nullable: Nullable): number | undefined;
function num(config?: Config): number;
function num(config?: Config | null) {
  return column({
    type: Number,
    set: (value: number) => value,
    get: (value: string) => {
      return value != null ? parseFloat(value) : value;
    },
  }, config);
}

function bool(nullable: Nullable): boolean | undefined;
function bool(config?: Config): boolean;
function bool(config?: Config) {
  return column({
    type: Boolean,
    set: (value: boolean) => value ? 1 : 0,
    get: (value: number) => value === undefined ? value : Boolean(value),
  }, config);
}

function date(nullable: Nullable): Date | undefined;
function date(config?: Config): Date;
function date(config?: Config) {
  return column({
    type: Date,
    set: (value: Date) => value ? new Date(value).toISOString() : undefined,
    get: (value: string) => value ? new Date(value) : undefined,
  }, config);
}

function uuid(nullable: Nullable): string | undefined;
function uuid(config?: Config): string;
function uuid(config?: Config) {
  return column({ type: String }, config);
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