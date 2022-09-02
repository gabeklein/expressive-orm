import Connection from './connection/Connection';
import Field from './Field';
import Primary from './instruction/Primary';
import Query, { Join } from './Query';
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

  static async getOne<T extends Entity, R, I>(
    this: Entity.Type<T>,
    from: Query.Options<T, R, I>
  ){
    new Query(this).config(from);

    return {} as R;
  }

  static where<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.WhereFunction<T> | Query.WhereObject<T>
  ){
    return new Query(this).where(from);
  }

  static select<T extends Entity, R>(
    this: Entity.Type<T>,
    from: Query.SelectFunction<T, R>
  ): Query<T, R>;

  static select<T extends Entity, K extends Entity.Field<T>>(
    this: Entity.Type<T>,
    fields: K[]
  ): Query<T, Pick<Query.Select<T>, K>>;

  static select<T extends Entity>(
    this: Entity.Type<T>,
    from: "*"
  ): Query<T, Query.Select<T>>;

  static select<T extends Entity, R>(
    this: Entity.Type<T>,
    from: "*" | Entity.Field<T>[] | Query.SelectFunction<T, R>
  ){
    return new Query(this).select(from as any);
  }

  static query<T extends Entity, R, I>(
    this: Entity.Type<T>,
    from: Query.Options<T, R, I>
  ){
    return new Query(this).config(from);
  }

  static init<T extends Entity>(
    this: Entity.Type<T>,
    connection?: Connection){

    return new Table(this, connection);
  }

  static join(mode: Join.Mode){
    
  }
}

export default Entity;