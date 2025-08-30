import { type Type } from './Type';

type Async<T> = T | Promise<T>;

class Field {
  key: string;
  column: string;
  nullable = false;
  optional = false;
  type?: unknown;

  constructor(key: string, ...opts: Config[]) {
    this.key = key;
    this.column = underscore(key);

    for(const opt of opts) {
      if (opt === null) {
        this.nullable = true;
      } else if (typeof opt === 'object') {
        Object.assign(this, opt);
      }
    }
  }

  set(value: any): Async<string | number | null | undefined> {
    return value;
  }
 
  get(value: any, from: Record<string, any>): Async<unknown> {
    return value;
  }

  async parse(into: Type & Record<string, any>, raw: Record<string, any>) {
    into[this.key] = await this.get(raw[this.column], raw);
  }

  async apply(update: Record<string, string>, from: Record<string, any>, partial?: boolean) {
    const { key, column, nullable, optional } = this;
    const allowMissing = optional || nullable || partial;
    let value = from[key];

    if (value === undefined && allowMissing)
      return;

    value = await this.set(value);

    if (value == null)
      if (nullable)
        return null;
      else
        throw new Error(`Missing required field: ${key}`);

    update[column] = value;
  }
}

interface Nullable extends Partial<Field> {
  nullable: true;
}

type Config = Partial<Field> | null | undefined | false;

type Instruction = <T extends Type>(key: string, parent: Type.Class<T>) => Field | void;

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
  return use((key) => {
    return new Field(key, ...config);
  });
}

function str(nullable: null | Nullable): string | undefined;
function str(config?: Config): string;
function str(config?: Config | null) {
  return column({ type: String }, config);
}

function num(nullable: null | Nullable): number | undefined;
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

function bool(nullable: null | Nullable): boolean | undefined;
function bool(config?: Config): boolean;
function bool(config?: Config) {
  return column({
    type: Boolean,
    set: (value: boolean) => value ? 1 : 0,
    get: (value: number) => value === undefined ? value : Boolean(value),
  }, config);
}

function date(nullable: null | Nullable): Date | undefined;
function date(config?: Config): Date;
function date(config?: Config) {
  return column({
    type: Date,
    set: (value: Date) => value ? value.toISOString() : undefined,
    get: (value: string) => value ? new Date(value) : undefined,
  }, config);
}

function uuid(nullable: null | Nullable): string | undefined;
function uuid(config?: Config): string;
function uuid(config?: Config) {
  return column({ type: String }, config);
}

function json<T>(nullable: null | Nullable): T | undefined;
function json<T>(config?: Config): T;
function json<T>(config?: Config): T {
  return column({
    type: Object,
    set: (value: T) => JSON.stringify(value),
    get: (value: string) => value ? JSON.parse(value) : undefined,
  }, config);
}

function one<T extends Type.Class>(Class: T, forColumn?: string) {
  const foreignKeyColumn = forColumn || `${Class.table}_id`;

  return column({
    type: Class,
    column: foreignKeyColumn,
    get: (id: number) => {
      return Class.one({ id }, false);
    },
    set: (value: Type.Instance<T> | undefined) => {
      if (value == null)
        return null;

      const id = (value as any).id;

      if (id == null)
        throw new Error(`Cannot assign unsaved ${Class.name} to ${foreignKeyColumn}`);

      return id;
    }
  });
}

function get<T extends Type.Class>(Class: T, parentIdField: keyof Type.Instance<T>) {
  return use<T>((key, type) => {
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

    get.toString = () => `get${Class.name}`;
    Object.defineProperty(type.prototype, key, { get });
  });
}

function underscore(str: string) {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
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
  get,
  one,
  use,
  underscore
}