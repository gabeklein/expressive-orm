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

  set(this: Field, value: any): Async<string | number | null | undefined> {
    return value;
  }
 
  get(this: Field, value: any, from: Record<string, any>): Async<unknown> {
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

const ONE = new Map<Type.Class, Map<Type.Class, Field | null>>();

function one<T extends Type>(Class: Type.Class<T>, nullable: null | Nullable): T | undefined;
function one<T extends Type>(Class: Type.Class<T>, config?: Config): T;
function one<T extends Type>(Class: Type.Class<T>, config?: Config) {
  const foreignKeyColumn = config && config.column || `${Class.table}_id`;

  return use((key, type) => {
    let rel = ONE.get(type);

    if (!rel)
      ONE.set(type, rel = new Map());

    const field = new Field(key, {
      type: Class,
      column: foreignKeyColumn,
      get(id: number){
        if (id == null)
          if(this.nullable)
            return undefined;
          else
            throw new Error(`Missing required relation: ${Class.name}`);

        try {
          return (Class as Type.Class).one({ id });
        }
        catch (error) {
          throw new Error(`Failed to load relation ${Class.name} for ${this.key}: ${error}`);
        }
      },
      async set(value: Type.Instance<T> | Type.Insert<T> | number | null | undefined){
        if (value == null)
          if(this.nullable)
            return null;
          else
            throw new Error(`Missing required relation: ${Class.name}`);

        if(value instanceof Class){
          const id = (value as any).id;

          if (id == null)
            throw new Error(`Cannot assign unsaved ${Class.name} to ${foreignKeyColumn}`);

          return id;
        }

        if(typeof value === "object")
          return (await Class.new(value)).id;

        return value;
      }
    }, config);

    rel.set(Class, rel.has(Class) ? null : field);

    return field;
  });
}

function get<T extends Type.Class>(Class: T, field?: keyof Type.Instance<T>) {
  return use<T>((key, type) => {
    function get(this: Type.Instance<T>) {
      const { id } = this;

      if (!id)
        throw new Error(`Parent entity ${id} does not exist`);

      if (!field) {
        Class.fields;
        const rel = ONE.get(Class)?.get(type);

        if (!rel){
          const message = rel === null
            ? `There are multiple relationships, you will need to specify which one to use.` 
            : `Did you forget to use one(${Class.name}) in this model?`;

          throw new Error(`No relationship inferred for ${Class.name} in ${type.name}. ${message}`);
        }

        field = rel.key as any;
      }

      class Child extends (Class as typeof Type) {
        static subset = { [field as string]: id };
      };

      Object.defineProperty(Child, 'name', { value: Class.name });

      return Child;
    };

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