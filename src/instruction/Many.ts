import Entity from '../Entity';
import Query from '../Query';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace Many {
  export type Entites<T extends Entity> = T[] & {
    [TYPE]?: ManyToOneRelation;
    [WHERE]?: Query.Where<T>
    [SELECT]?: Query.Select<T>[];
  };

  interface Select<T extends Entity> {
    map<R>(select: (from: Query.Select<T>) => R): R;
  }

  interface Options {

  }
}

function Many<T extends Entity>(type: Entity.Type<T>): Many.Entites<T>;
function Many(type: Entity.Type, options?: Many.Options){
  return ManyToOneRelation.create({ type, ...options });
}

class ManyToOneRelation extends Field {
  sub = new WeakMap<Query<any>, Query<any>>();
  datatype = undefined;
  type!: Entity.Type;

  subquery(parent: Query<any>){
    let query = this.sub.get(parent);

    if(!query){
      query = new Query(this.type);
      this.sub.set(parent, query);
    }

    return query;
  }

  where(query: Query<any>){
    const sub = this.subquery(query);

    return this.type.map((field) => {
      return field.where(sub);
    })
  };

  select(query: Query<any>, path: string[]){
    const sub = this.subquery(query);
    const proxy = this.type.map((field, key) => {
      return field.select(sub, [key]);
    });

    query.addSelect("id", (a, b) => {
      // const { id } = a;
      
    });

    return {
      map: (fn: any) => {
        sub.mapper = fn;
        return fn(proxy);
      }
    }
  }
}

export default Many;