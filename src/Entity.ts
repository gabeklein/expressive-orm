import Field from './instruction/Field';
import Query from './Query';

const describe = Object.getOwnPropertyDescriptor;

const REGISTER = new Map<typeof Entity, Table>();
const INSTRUCTION = new Map<symbol, SetupFunction>();

type SetupFunction = (parent: typeof Entity, key: string) => Field;
export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

declare namespace Entity {
  interface Connection {}

  type List<T extends Entity> = T[];

  type DataRecusive<T> =
    T extends string ? string :
    T extends number ? number :
    T extends boolean ? boolean :
    T extends List<infer U> ? Pure<U>[] :
    T extends Entity ? Pure<T> : T;

  type Pure<T extends Entity> = {
    [K in Exclude<keyof T, keyof Entity>]-?: DataRecusive<T[K]>;
  }

  type Property<T extends typeof Entity> =
    Exclude<keyof InstanceOf<T>, keyof Entity>;
}

class Table {
  entity: typeof Entity;
  fields: Map<string, Field>;
  connection?: Entity.Connection;
  name: string;

  constructor(
    entity: typeof Entity,
    connection?: Entity.Connection){

    const fields = this.fields = new Map();

    this.entity = entity;
    this.name = /class (\w+?) /.exec(entity.toString())![1];
    this.connection = connection;

    const sample = new (entity as any)();
    
    for(const key in sample){
      const { value } = describe(sample, key)!;
      const instruction = INSTRUCTION.get(value);    

      if(!instruction)
        continue;

      delete (sample as any)[key];
      INSTRUCTION.delete(value);

      const field = instruction(sample, key);

      if(field)
        fields.set(key, field);
    }
  }
}

abstract class Entity {
  static get table(){
    return REGISTER.get(this) || this.init();
  }

  // table: Info;

  protected constructor(){}

  /**
   * Create an arbitary map of managed fields.
   */
  static map<T extends typeof Entity>(
    this: T,
    getValue: (type: Field, key: string) => any
  ){
    const proxy = {} as any;

    this.table.fields.forEach((type, key) => {
      Object.defineProperty(proxy, key, {
        get: () => getValue(type, key as any)
      })
    })
    
    return proxy;
  }

  static async getOne<T extends typeof Entity, R>(
    this: T, from: Query.Options<InstanceOf<T>, R>
  ){
    this.query(from);

    return {} as R;
  }

  static query<T extends typeof Entity, R>(
    this: T, from: Query.Options<InstanceOf<T>, R>
  ){
    const query = new Query(this) as Query<InstanceOf<T>>;

    if(from.where)
      query.applyQuery(from.where);

    if(from.select)
      query.applySelection(from.select);

    return query;
  }

  static init<T extends typeof Entity>(
    this: T, connection?: Entity.Connection){

    const info = new Table(this, connection);
    REGISTER.set(this, info);
    return info;
  }

  static apply(instruction: SetupFunction){
    const placeholder = Symbol(`ORM instruction`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }
}

export default Entity;