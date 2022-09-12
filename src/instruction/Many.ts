import Entity from '../Entity';
import Field from '../Field';
import Query from '../Query';

declare namespace Many {
  interface Select<T extends Entity> {
    map<R>(select: (from: Query.Select<T>) => R): R;
  }

  interface Options {

  }
}

function Many<T extends Entity>(type: Entity.Type<T>): T[];
function Many(type: Entity.Type, options?: Many.Options){
  return ManyToOneRelation.create({ type, ...options });
}

class ManyToOneRelation<T extends Entity = Entity> extends Field {
  sub = new WeakMap<Query<any>, Query<any>>();
  datatype = undefined;
  type!: Entity.Type;

  // subquery(parent: Query<any>){
  //   let query = this.sub.get(parent);

  //   if(!query){
  //     query = new Query(this.type);
  //     this.sub.set(parent, query);
  //   }

  //   return query;
  // }

  // select(query: Query<any>): Many.Select<T> {
  //   const sub = this.subquery(query);
  //   const proxy = this.type.map((field, key) => {
  //     return field.select(sub, [key]);
  //   });

  //   query.addSelect("id", (a, b) => {
  //     // const { id } = a;
      
  //   });

  //   return {
  //     map(select: any){
  //       sub.mapper = select;
  //       return select(proxy);
  //     }
  //   };
  // }
}

export default Many;