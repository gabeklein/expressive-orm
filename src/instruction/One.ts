import Entity from '../Entity';
import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

declare namespace One {
  type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation;
    [WHERE]?: Query.Where<T>
  }

  type Optional<T extends Entity> = Field<T> | undefined | null;

  interface Options<T extends Entity> {
    type?: Entity.Type<T>;
    column?: string;
    nullable?: boolean;
  }

  interface Nullable<T extends Entity> extends Options<T> {
    nullable: true;
  }
}

type One<T extends Entity> = One.Field<T>;

function One<T extends Entity>(type: Entity.Type<T>): One.Field<T>;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Nullable<T>): One.Optional<T>;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Options<T>): One.Field<T>;
function One<T extends Entity>(options: One.Nullable<T>): One.Optional<T>;
function One<T extends Entity>(options: One.Options<T>): One.Field<T>;
function One<T extends Entity>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { type: arg1 };

  return OneToManyRelation.create({ ...arg2, ...arg1 });
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
      return field.where(query, table + "." + field.column);
    })
  };

  select(query: Query<any>, path: string[]){
    const table = this.join(query);

    return this.type.map((field, key) => {
      const column = table + "." + field.column;

      return field.select
        ? field.select(query, [...path, key])
        : query.addSelect(column, [...path, key]);
    })
  }
}

export default One;