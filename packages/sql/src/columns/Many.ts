import { Type } from '../Type';
import { Field } from '../Field';

interface Many<T extends Type> extends Field {
  type: Type.EntityType<T>;
}

function Many<T extends Type>(type: Type.EntityType<T>): T[]{
  return Field({});
}

// class ManyToOneRelation extends Field {
//   sub = new WeakMap<Query, Query>();
//   datatype = undefined;
//   type!: Type.EntityType;

//   // subquery(parent: Query){
//   //   let query = this.sub.get(parent);

//   //   if(!query){
//   //     query = new Select(this.type);
//   //     this.sub.set(parent, query);
//   //   }

//   //   return query;
//   // }

//   // select(query: Query): Many.Select<T> {
//   //   const sub = this.subquery(query);
//   //   const proxy = this.type.map((field, key) => {
//   //     return field.select(sub, [key]);
//   //   });

//   //   query.addSelect("id", (a, b) => {
//   //     // const { id } = a;
      
//   //   });

//   //   return {
//   //     map(select: any){
//   //       sub.mapper = select;
//   //       return select(proxy);
//   //     }
//   //   };
//   // }
// }

export { Many }