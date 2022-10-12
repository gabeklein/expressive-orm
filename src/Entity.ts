import Connection from './connection/Connection';
import Field from './Field';
import Primary from './fields/Primary';
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
}

abstract class Entity {
  this!: Entity.Type;
  id = Primary();

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

      this.table = /class (\w+?) /.exec(this.toString())![1];
      this.schema = "";
      this.connection = connection;
      this.fields = new Map();
      this.deps = new Set();
      
      const prime = new (this as any)();
      
      for(const key in prime){
        const { value } = describe(prime, key)!;
        const instruction = INSTRUCTION.get(value);    
  
        if(!instruction)
          continue;
  
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

  static field(instruction: Entity.Instruction){
    const placeholder = Symbol(`ORM instruction`);
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

  // static select<T extends Entity, R>(
  //   this: Entity.Type<T>,
  //   from: Entity.Where<T, R>
  // ){
  //   return new Query(where => {
  //     return from(where(this), where);
  //   })
  // }

  // static insert<T extends Entity, R>(
  //   this: Entity.Type<T>,
  //   data: Insert.Values<T>
  // ){
  //   return new Insert(this, data).exec();
  // }

  // static async get<T extends Entity, R>(
  //   this: Entity.Type<T>,
  //   from: Entity.Where<T, R>
  // ){
  //   return this.select(from).get();
  // }

  // static async getOne<T extends Entity, R>(
  //   this: Entity.Type<T>,
  //   from: Entity.Where<T, R>
  // ){
  //   return this.select(from).getOne();
  // }
}

export default Entity;