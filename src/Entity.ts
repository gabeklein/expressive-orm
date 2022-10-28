import Connection from './connection/Connection';
import Field from './Field';
import { capitalize } from './generate/util';
import { insertQuery } from './query/insert';
import Query from './query/Query';

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

const REGISTER = new Set<Entity.Type>();
const INSTRUCTION = new Map<symbol, Entity.Instruction>();

const describe = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;

declare namespace Entity {
  type Type<T extends Entity = Entity> =
    & (abstract new () => T)
    & typeof Entity;

  type List<T extends Entity> = T[];

  type DataRecusive<T> =
    T extends string ? string :
    T extends number ? number :
    T extends boolean ? boolean :
    T extends List<infer U> ? Pure<U>[] :
    T extends Entity ? Pure<T> : T;

  type Pure<T extends Entity> = {
    [K in Field<T>]-?: DataRecusive<T[K]>;
  }

  type Field<T extends Entity> = Exclude<keyof T, "table">;

  type Where<T extends Entity, R> =
    (source: Query.Type<T>, query: Query.Where) => () => R;

  type Instruction = (parent: Entity.Type, key: string) => void;

  namespace Insert {
    type Property<T> = T extends Entity ? T | number : T;
  }

  type Insert<T extends Entity> = {
    [K in Entity.Field<T>]?: Insert.Property<T[K]>;
  }
}

abstract class Entity {
  this!: Entity.Type;
  id?: number | string;

  static table: string;
  static schema: string;
  static fields: Map<string, Field>;
  static deps: Set<Entity.Type>;
  static connection?: Connection;
  static focus?: { [key: string]: any };

  static ensure<T extends Entity>(
    this: Entity.Type<T>,
    connection?: Connection){

    if(!REGISTER.has(this)){
      REGISTER.add(this);

      this.table = this.name;
      this.schema = "";
      this.connection = connection;
      this.fields = new Map();
      this.deps = new Set();
      
      const prime = new (this as any)();
      
      for(const key in prime){
        const { value } = describe(prime, key)!;
        const instruction = INSTRUCTION.get(value);    
  
        if(!instruction)
          throw new Error(`Entities do not support normal values, only fields. Did you forget to import \`${capitalize(typeof value)}\`?`);
  
        INSTRUCTION.delete(value);
        instruction(this, key);
        define(prime, key, {
          get: () => this.focus![key],
          set: is => this.focus![key] = is
        })
      }
    }

    return this;
  }

  static add(instruction: Entity.Instruction){
    const placeholder = Symbol(`field`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }

  /**
   * Create an arbitary map of managed fields.
   */
  static map<T extends Entity>(
    this: Entity.Type<T>,
    getValue: (type: Field, key: Entity.Field<T>, proxy: {}) => any,
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
            key as Entity.Field<T>,
            proxy
          );

          if(cache !== false)
            define(proxy, key, { value });

          return value;
        }
      })
    
    return proxy;
  }

  static insert<T extends Entity>(this: Entity.Type<T>, data: Entity.Insert<T>): Promise<void>;
  static insert<T extends Entity>(this: Entity.Type<T>, number: number, mapper: (index: number) => Entity.Insert<T>): Promise<void>;
  static insert<T extends Entity, I>(this: Entity.Type<T>, input: I[], mapper: (item: I) => Entity.Insert<T>): Promise<void>;
  static insert<T extends Entity>(this: Entity.Type<T>, data: Entity.Insert<T>[]): Promise<void>;
  static insert<T extends Entity>(
    this: Entity.Type<T>,
    data: any,
    mapper?: (i: any) => Entity.Insert<T>){
  
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

export default Entity;