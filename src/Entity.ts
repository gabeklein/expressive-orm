import Field from './instruction/Field';
import Query from './Query';
import Table from './Table';

const REGISTER = new Map<typeof Entity, Table>();

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

declare namespace Entity {
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

abstract class Entity {
  static get table(){
    return REGISTER.get(this) || this.init();
  }

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
    this: T, connection?: Table.Connection){

    const info = new Table(this, connection);
    REGISTER.set(this, info);
    return info;
  }
}

export default Entity;