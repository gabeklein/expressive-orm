import Entity from '../Entity';
import Query from '../Query';
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
    const table = this.type.tableName;
    const proxy = this.type.map((key, field) => {
      return field.touch(query, table + "." + key);
    })

    query.builder.leftJoin(table, `${table}.id`, `authorID`);

    return proxy;
  };
}

export default One;