import Connection from './connection/Connection';
import Field from './instruction/Field';
import Primary from './instruction/Primary';
import Query from './Query';
import Table from './Table';

const REGISTER = new Map<Entity.Type, Table>();

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

declare namespace Entity {
  type Type<T extends Entity = Entity> =
    typeof Entity & (abstract new () => T);

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
  id = Primary();

  static get table(): Table {
    return REGISTER.get(this) || this.init();
  }

  /**
   * Create an arbitary map of managed fields.
   */
  static map<T extends Entity>(
    this: Entity.Type<T>,
    getValue: (type: Field, key: string) => any
  ){
    return this.table.map(getValue);
  }

  static async getOne<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.Options<T, R>
  ){
    this.query(from);

    return {} as R;
  }

  static where<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.WhereFunction<T>
  ){
    return new Query(this).where(from);
  }

  static select<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.SelectFunction<T, R>
  ){
    return new Query(this).select(from);
  }

  static query<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.Options<T, R>
  ){
    const query = new Query(this);

    if(from.where)
      query.where(from.where);

    if(from.select)
      query.select(from.select);

    return query as Query<T, R>;
  }

  static init<T extends Entity>(
    this: Entity.Type<T>,
    connection?: Connection){

    const info = new Table(this, connection);
    REGISTER.set(this, info);
    return info;
  }
}

export default Entity;