import Entity from '../Entity';
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

  use(path: string, query: Query<any>){
    const proxy = {} as Query.Where<any>;
    const table = this.type.tableName;

    query.builder.leftJoin(table, `${table}.id`, `authorID`);

    this.type.fields.forEach((field, key) => {
      Object.defineProperty(proxy, key, {
        get: () => query.assert(field, table + "." + key)
      });
    })

    return proxy;
  };
}

export default One;