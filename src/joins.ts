import Entity from './Entity';
import Field from './Field';
import Query from './Query';

export namespace Join {
  export type Mode = "left" | "right" | "inner" | "outer";

  type WhereClause<T> =
    T extends Field.Assertions<infer A> ? A : never;

  export type Where<T extends Entity> = {
    [K in Entity.Field<T>]: WhereClause<T[K]>;
  }

  export type Used = {
    [name: string]: Where<Entity>;
  }
}

export function createJoin(
  type: Entity.Type,
  mode: Join.Mode){

  const query = new JoinQuery(type);

  return type.map(field => {
    field.where(query, )
  })
}

class JoinQuery<T extends Entity> extends Query<T> {

}