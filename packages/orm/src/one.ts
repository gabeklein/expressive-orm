import { Infer, use } from "./fields";
import { Config, Field } from './Field';
import Type from "./Type";

const ONE = new Map<Type.Class, Map<Type.Class, Field | null>>();

class OneToOneField<T extends Type = Type> extends Field {
  type: Type.Class<T>;
  column: string;
  lazy = false;
  
  constructor(key: string, parent: Type.Class, from: Type.Class<T>, ...config: Config[]) {
    super(key, ...config);
    this.type = from;
    this.column = `${from.table}_id`;

    Object.assign(this, ...config);

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

    const fetch = () => Class.one(id, false);

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

export function getRelated<T extends Type.Class>(Class: T, type: Type.Class) {
  const rel = ONE.get(Class)?.get(type);

  if (rel) return rel.key as keyof Type.Instance<T>;

  const message = rel === null
  ? `There are multiple relationships, you will need to specify which one to use.` 
  : `Did you forget to use one(${Class.name}) in this model?`;

  throw new Error(`No relationship inferred for ${Class.name} in ${type.name}. ${message}`);
}

function one<T extends Type, C extends Config<OneToOneField>[]>(from: Type.Class<T>, ...config: C){
  return use<T>((key, type) => new OneToOneField(key, type, from, ...config)) as Infer<C, T>;
}

const lazy = { lazy: true };

export { one, lazy };