import Field from "./columns/Field";
import Query from "./query/Query";

const describe = Object.getOwnPropertyDescriptor;

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
}

abstract class Entity {
  static fields: Map<string, Field>;
  static connection: Entity.Connection;
  static tableName: string;

  /** Name of entity. Infered by classname if not defined. */
  tableName!: string;

  /** Reserved for query */
  has!: never;
  
  protected constructor(){}

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

  static init(connection?: Entity.Connection){
    let register = this.fields;

    if(!register){
      const sample = new (this as any)();
      register = this.fields = new Map()
      
      for(const key in sample){
        const { value } = describe(sample, key)!;      

        if(typeof value != "symbol")
          return;

        const field = Field.assign(this, key, value);

        if(field)
          register.set(key, field);
      }

      this.tableName = sample.tableName || getClassName(this);
    }

    this.connection = connection || {};
  }
}

function getClassName(subject: any){
  return /class (\w+?) /.exec(subject.toString())![1];
}

export default Entity;