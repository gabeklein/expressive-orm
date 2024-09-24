import { Connection } from './connection/Connection';
import { Field } from './field/Field';
import { capitalize } from './generate/util';
import { insert } from './query/insert';
import { Query } from './query/Query';

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

const REGISTER = new Set<Type.EntityType>();
const CONNECTION = new Map<typeof Type, Connection>();
const INSTRUCTION = new Map<symbol, Type.Instruction>();

const describe = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;

declare namespace Type {
  type EntityType<T extends Type = Type> =
    & (abstract new () => T)
    & typeof Type;

  type List<T extends Type> = T[];

  type DataRecusive<T> =
    T extends string ? string :
    T extends number ? number :
    T extends boolean ? boolean :
    T extends List<infer U> ? Pure<U>[] :
    T extends Type ? Pure<T> : T;

  type Pure<T extends Type> = {
    [K in Field<T>]-?: DataRecusive<T[K]>;
  }

  type Field<T extends Type> = Exclude<keyof T, "table">;

  type Where<T extends Type, R> =
    (source: Query.FromType<T>, query: Query.From) => () => R;

  type Instruction = (parent: Type.EntityType, key: string) => void;

  namespace Insert {
    type Property<T> = T extends Type ? T | number : T;
  }

  type Insert<T extends Type> = {
    [K in Type.Field<T>]?: Insert.Property<T[K]>;
  }
}

abstract class Type {
  // why is this non-nullable?
  this!: Type.EntityType;

  id: number | string = Field.create({
    datatype: "int",
    nullable: false,
    increment: true,
    primary: true
  });

  static table = "";
  static schema = "";
  static fields = new Map<string, Field>();
  static deps = new Set<Type.EntityType>();

  static get connection(){
    return CONNECTION.get(this) || Connection.default || new Connection({ client: "mysql" });
  }

  static set connection(connection: Connection){
    CONNECTION.set(this, connection);
  }

  static focus?: { [key: string]: any };

  static toString(){
    return this.name;
  }

  static ready<T extends Type>(this: Type.EntityType<T>){
    if(!REGISTER.has(this)){
      if(!this.table)
        this.table = this.name.replace(/^[A-Z]/, m => m.toLowerCase());

      REGISTER.add(this);
      
      const reference = new (this as any)();
      
      for(const key in reference){
        const { value } = describe(reference, key)!;
        const instruction = INSTRUCTION.get(value);    
  
        if(!instruction)
          throw new Error(`Entities do not support normal values, only fields. Did you forget to import \`${capitalize(typeof value)}\`?`);
  
        INSTRUCTION.delete(value);
        instruction(this, key);
        define(reference, key, {
          get: () => this.focus![key],
          set: is => this.focus![key] = is
        })
      }
    }

    return this;
  }

  static add(instruction: Type.Instruction){
    const placeholder = Symbol(`field`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }

  /**
   * Create an arbitary map of managed fields.
   */
  static map<T extends Type>(
    this: Type.EntityType<T>,
    getValue: (type: Field, key: Type.Field<T>, proxy: {}) => any,
    cache?: boolean
  ){
    this.ready();

    const proxy = {} as any;

    for(const [key, type] of this.fields)
      define(proxy, key, {
        configurable: true,
        get: () => {
          const value = getValue.call(
            proxy,
            type,
            key as Type.Field<T>,
            proxy
          );

          if(cache !== false)
            define(proxy, key, { value });

          return value;
        }
      })
    
    return proxy;
  }

  static insert<T extends Type>(this: Type.EntityType<T>, data: Type.Insert<T> | Iterable<Type.Insert<T>>): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, mapper: (index: number) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type, I>(this: Type.EntityType<T>, input: Iterable<I>, mapper: (item: I) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type>(
    this: Type.EntityType<T>,
    data: any,
    map?: (i: any) => Type.Insert<T>){

    if(typeof data == "number"){
      if(!map)
        throw new Error("Cannot insert a number without a map function!");
  
      data = Array.from({ length: data }, (_, i) => map(i));
    }
    else if(map)
      data = data.map(map);
    else if(!isIterable(data))
      data = [data];
    
    return insert(this, Array.from(data));
  }

  static get<T extends Type, R>(
    this: Type.EntityType<T>,
    query: Type.QueryFunction<T, R>){

    return new Query(where => {
      return query(where(this), where);
    });
  }
}

function isIterable(obj: unknown): obj is Iterable<unknown> {
  type MaybeIterable = {
    [Symbol.iterator]?: () => IterableIterator<unknown>;
  };

  return obj != null && typeof (obj as MaybeIterable)[Symbol.iterator] === 'function';
}

export { Type }