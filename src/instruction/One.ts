import Entity from '../Entity';
import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

namespace One {
  export type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation;
    [WHERE]?: Query.Where<T>
  }
}

type One<T extends Entity> = One.Field<T>;

function One<T extends Entity>(type: Entity.Type<T>): One<T>;
function One(type: Entity.Type){
  return OneToManyRelation.create({ type });
}

class OneToManyRelation extends Field {
  type!: Entity.Type;

  alias = new WeakMap<Query<any>, string>();

  get referenceColumn(){
    return this.type.table.name.replace(/(^[A-Z])/i,
      (str: string, n1: string) => n1.toLowerCase()
    ) + "Id";
  }

  join(query: Query<any>){
    let name = this.alias.get(query);

    if(!name){
      name = this.type.table.name;
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

      return field.select
        ? field.select(query, [...path, key])
        : query.addSelect(column, [...path, key]);
    })
  }
}

export default One;