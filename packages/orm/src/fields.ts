import { type Type } from './Entity';

interface Field {
  nullable?: boolean;
  column?: string;
  set?: (value: any) => any;
  get?: (value: any) => any;
  fallback?: any;
  optional?: boolean;
  type?: unknown;
}

interface Nullable extends Field {
  nullable: true;
}

type Config = Field | null | undefined | false;

type Instruction = <T extends Type>(parent: Type.Class<T>, key: string) => Field | void;

const USE = new Map<symbol, Instruction>();

function init<T extends Type>(type: Type.Class<T>) {
  const fields = new Map<string, Field>();
  const base = new (type as any)() as Type;

  for (const key in base) {
    if (key === 'snap')
      continue;

    const value = (base as any)[key];
    const instruction = USE.get(value);

    if (typeof instruction === 'function')
      USE.delete(value);
    else
      continue;

    const config = instruction(type, key);

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
  return use(() => {
    return Object.assign({}, ...config.map(c => {
      return c === null ? { nullable: true } : c;
    })) as Field;
  });
}

function str(nullable: null | Nullable): string | undefined;
function str(config?: Config): string;
function str(config?: Config | null): string {
  return column({ type: "string" }, config);
}

function num(nullable: null | Nullable): number | undefined;
function num(config?: Config): number;
function num(config?: Config | null): number {
  return column({
    type: "number",
    set: (value: number) => value,
    get: (value: string) => {
      return value != null ? parseFloat(value) : value;
    },
  }, config);
}

function bool(nullable: null | Nullable): boolean | undefined;
function bool(config?: Config): boolean;
function bool(config?: Config): boolean {
  return column({
    type: "boolean",
    set: (value: boolean) => value ? 1 : 0,
    get: (value: number) => value === undefined ? value : Boolean(value),
  }, config);
}

function date(nullable: null | Nullable): Date | undefined;
function date(config?: Config): Date;
function date(config?: Config): Date {
  return column({
    type: Date,
    set: (value: Date) => value ? value.toISOString() : undefined,
    get: (value: string) => value ? new Date(value) : undefined,
  }, config);
}

function uuid(nullable: null | Nullable): string | undefined;
function uuid(config?: Config): string;
function uuid(config?: Config) {
  if (config === null)
    config = { nullable: true };

  return column({ type: "string" }, config);
}

function json<T>(nullable: null | Nullable): T | undefined;
function json<T>(config?: Config): T;
function json<T>(config?: Config): T {
  return column({
    type: "json",
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config);
}

function get<T extends Type.Class>(Class: T, parentIdField: keyof Type.Instance<T>) {
  return use<T>((type, key) => {
    function get(this: Type.Instance<T>) {
      const { id } = this;

      if (!id)
        throw new Error(`Parent entity ${id} does not exist`);

      class Child extends (Class as typeof Type) {
        static subset = { [parentIdField]: id };
      };

      Object.defineProperty(Child, 'name', { value: Class.name });

      return Child;
    }

    // get.name = `get${Type.name}`;
    get.toString = () => `get${Class.name}`;

    Object.defineProperty(type.prototype, key, { get });
  });
}

export {
  Field,
  Nullable,
  init,
  json,
  str,
  num,
  bool,
  date,
  uuid,
  get,
  use
}