import Entity from '../entity';
import Query from '../query/Query';
import Field, { TYPE, WHERE } from "./Field";

type InstanceOf<T> =
  T extends { prototype: infer U } ? U : never;

namespace One {
  export type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation;
    [WHERE]?: Query.Where<T>
  }
}

type One<T extends Entity> = One.Field<T>;

function One<T extends typeof Entity>(type: T): One<InstanceOf<T>>;
function One(type: typeof Entity){
  return OneToManyRelation.create({ type });
}

class OneToManyRelation extends Field {
  type!: typeof Entity;

  assert(path: string, query: Query<any>){
    const proxy = {} as Query.Where<any>;

    for(const [ key, field ] of this.type.fields)
      Object.defineProperty(proxy, key, {
        get(){
          return field.assert(path + "." + key, query)
        }
      });

    return proxy;
  };
}

export default One;