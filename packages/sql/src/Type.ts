import { Connection } from './connection/Connection';
import { Field } from './field/Field';
import { capitalize } from './generate/util';
import { insertQuery } from './query/insert';
import { Query } from './query/Query';

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

const REGISTER = new Set<Type.EntityType>();
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
    (source: Query.EntityOfType<T>, query: Query.Where) => () => R;

  type Instruction = (parent: Type.EntityType, key: string) => void;

  namespace Insert {
    type Property<T> = T extends Type ? T | number : T;
  }

  type Insert<T extends Type> = {
    [K in Type.Field<T>]?: Insert.Property<T[K]>;
  }
}

abstract class Type {
  this!: Type.EntityType;
  id?: number | string;

  static table: string;
  static schema: string;
  static fields: Map<string, Field>;
  static deps: Set<Type.EntityType>;
  static connection?: Connection;
  static focus?: { [key: string]: any };

  static ensure<T extends Type>(this: Type.EntityType<T>){
    if(!REGISTER.has(this)){
      REGISTER.add(this);

      this.table = this.name;
      this.schema = "";
      this.fields = new Map();
      this.deps = new Set();
      
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
    const proxy = {} as any;

    this.ensure();

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

  static insert<T extends Type>(this: Type.EntityType<T>, data: Type.Insert<T>): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, mapper: (index: number) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type, I>(this: Type.EntityType<T>, input: I[], mapper: (item: I) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, data: Type.Insert<T>[]): Promise<void>;
  static insert<T extends Type>(
    this: Type.EntityType<T>,
    data: any,
    mapper?: (i: any) => Type.Insert<T>){
  
    if(!this.connection)
      throw new Error("weird");
  
    if(mapper)
      data = typeof data == "number"
        ? Array.from({ length: data }, (_, i) => mapper(i))
        : data.map(mapper);
  
    else if(typeof data == "number")
      throw new Error("Cannot insert a number without a map function!");

    else if(!Array.isArray(data))
      data = [data];
  
    const sql = insertQuery(this, data);
    
    return this.connection.query(sql) as Promise<void>;
  }

  static toString(){
    return this.name;
  }
}

export { Type }