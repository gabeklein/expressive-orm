import { type Type } from './Type';

type Async<T> = T | Promise<T>;
type MaybeLazy<T> = T | Promise<T> | (() => Async<T>);

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

  set(this: Field, value: any, compare?: boolean): Async<string | number | null | undefined> {
    return value;
  }
 
  get(this: Field, value: any, from: Record<string, any>): MaybeLazy<unknown> {
    return value;
  }

  parse(this: Field, into: Type & Record<string, any>, raw: Record<string, any>): Async<void> {
    const value = this.get(raw[this.column], raw);
    const assign = (value: any) => {
      Object.defineProperty(into, this.key, { value, configurable: true });
      return value;
    };

    if(value instanceof Function){
      let promise: Promise<any> | undefined;

      Object.defineProperty(into, this.key, {
        configurable: true,
        get(){
          if(promise instanceof Promise)
            throw promise;

          const result = value();

          if(result instanceof Promise)
            throw promise = result.then(assign);
          else
            return assign(result);
        }
      });

      return;
    }

    if(value instanceof Promise)
      return value.then(assign);
    else
      assign(value);
  }

  async apply(update: Record<string, string>, from: Record<string, any>, partial?: boolean) {
    const { key, column, nullable, optional } = this;
    const allowMissing = optional || nullable || partial;
    let value = from[key];

    if (value === undefined && allowMissing)
      return;

    value = await this.set(value);

    if (value == null && !nullable)
      throw new Error(`Missing required field: ${key}`);

    update[column] = value;
  }
}

type Nullable<T extends Field = Field> = null | Partial<T> & { nullable: true }

type Config<T = Field> = Partial<T> | null | undefined | false;

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
    set: (value: Date) => value ? value.toISOString() : undefined,
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

const ONE = new Map<Type.Class, Map<Type.Class, Field | null>>();

class OneToOneField<T extends Type = Type> extends Field {
  type: Type.Class<T>;
  column: string;
  lazy = false;
  
  constructor(key: string, parent: Type.Class, from: Type.Class<T>, config?: Config) {
    super(key, config);
    this.type = from;
    this.column = `${from.table}_id`;

    Object.assign(this, config);

    let rel = ONE.get(parent);

    if (!rel)
      ONE.set(parent, rel = new Map());

    rel.set(from, rel.has(from) ? null : this);
  }

  get(id: number){
    const Class = this.type;
    
    if (id == null)
      if(this.nullable)
        return undefined;
      else
        throw new Error(`Missing required relation: ${Class.name}`);

    const fetch = cached.bind(Class, id);

    if(this.lazy)
      return fetch;

    const message = (err: Error) => {
      if(err instanceof Error)
        err.message = `Failed to load relation ${Class.name} for ${this.key}: ${err.message}`;

      throw err;
    };

    try {
      const result = fetch();
      return result instanceof Promise ? result.catch(message) : fetch();
    }
    catch (error) {
      message(error as Error);
    }
  }

  async set(
    value: Type.Instance<T> | Type.Insert<T> | number | null | undefined,
    compare?: boolean){

    const { type: Class, column } = this;

    if (value == null)
      if(this.nullable)
        return null;
      else
        throw new Error(`Missing required relation: ${Class.name}`);

    if(value instanceof Class){
      const id = (value as any).id;

      if (id == null)
        throw new Error(`Cannot assign unsaved ${Class.name} to ${column}`);

      return id;
    }

    if(typeof value === "object"){
      const got = compare
        ? Class.one(value as any, false)
        : Class.new(value)
      
      return (await got)?.id;
    }

    return value;
  }
}

function cached<T extends Type>(this: Type.Class<T>, id: number){
  return this.loaded.get(id) as (T | undefined) || this.one(id, false);
}

function one<T extends Type>(from: Type.Class<T>, nullable: Nullable<OneToOneField>): T | undefined;
function one<T extends Type>(from: Type.Class<T>, config?: Config<OneToOneField>): T;
function one<T extends Type>(from: Type.Class<T>, config?: Config<OneToOneField>) {
  return use<T>((key, type) => new OneToOneField(key, type, from, config));
}

function get<T extends Type.Class>(Class: T, field?: keyof Type.Instance<T>) {
  return use<T>((key, type) => {
    function get(this: Type.Instance<T>) {
      const { fields } = Class;
      const { id } = this;

      if (!id)
        throw new Error(`Parent entity ${id} does not exist`);

      if (!field) {
        const rel = ONE.get(Class)?.get(type);

        if (!rel){
          const message = rel === null
            ? `There are multiple relationships, you will need to specify which one to use.` 
            : `Did you forget to use one(${Class.name}) in this model?`;

          throw new Error(`No relationship inferred for ${Class.name} in ${type.name}. ${message}`);
        }

        field = rel.key as any;
      }

      if(field && fields.has(field as string)) {
        class Child extends (Class as typeof Type) {
          static subset = { [field as string]: id };
        };

        Object.defineProperty(Child, 'name', { value: Class.name });
        Object.defineProperty(this, key, { value: Child });

        return Child;
      }

      throw new Error(`Field ${String(field)} does not exist on ${Class.name}`);
    };

    get.toString = () => `get${Class.name}`;
    Object.defineProperty(type.prototype, key, { get, configurable: true });
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