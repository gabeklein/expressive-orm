import Connection from './connection/Connection';
import Field from './Field';
import Primary from './fields/Primary';
import Query from './Query';
import Table from './Table';

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
    [K in Field<T>]-?: DataRecusive<T[K]>;
  }

  type Field<T extends Entity> = Exclude<keyof T, "table">;

  type Where<T extends Entity, R> =
    (source: Query.Fields<T>, query: Query.Where) => () => R;
}

abstract class Entity {
  table!: Table;

  id = Primary();

  constructor(){
    Object.defineProperty(this, "table", {
      configurable: true,
      get(){
        return Table.get(this.constructor);
      },
      set(callback: any){
        Table.get(this.constructor).apply(callback, "table");
      }
    })
  }

  static get table(): Table {
    return Table.get(this);
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

  static select<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Entity.Where<T, R>
  ){
    return Query.select(where => {
      return from(where.from(this), where);
    })
  }

  static async get<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Entity.Where<T, R>
  ){
    return this.select(from).get();
  }

  static async getOne<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Entity.Where<T, R>
  ){
    return this.select(from).getOne();
  }

  static init<T extends Entity>(
    this: Entity.Type<T>,
    connection?: Connection){

    return new Table(this, connection);
  }
}

export default Entity;