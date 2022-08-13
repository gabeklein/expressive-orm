import Entity from '../Entity';
import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

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
  type.ensure();
  return OneToManyRelation.create({ type });
}

class OneToManyRelation extends Field {
  type!: typeof Entity;

  alias = new WeakMap<Query<any>, string>();

  get referenceColumn(){
    return this.type.tableName.replace(/(^[A-Z])/i,
      (str: string, n1: string) => n1.toLowerCase()
    ) + "Id";
  }

  join(query: Query<any>){
    let name = this.alias.get(query);

    if(!name){
      name = this.type.tableName;
      query.builder.leftJoin(name, `${name}.id`, this.referenceColumn);
      this.alias.set(query, name);
    }

    return name;
  }

  where(query: Query<any>, path: string){
    const table = this.join(query);

    return this.type.map((field) => {
      return field.where(query, table + "." + field.name);
    })
  };

  select(query: Query<any>, path: string[]){
    const table = this.join(query);

    return this.type.map((field, key) => {
      const column = table + "." + field.name;

      query.select(column, [...path, key]);
    })
  }
}

export default One;