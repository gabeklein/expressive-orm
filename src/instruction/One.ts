import Entity from '../Entity';
import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

declare namespace One {
  type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation;
    [WHERE]?: Query.Where<T>
  }

  type Nullable<T extends Entity> = Field<T> | undefined | null;

  interface Options<T extends Entity> {
    type?: Entity.Type<T>;
    column?: string;
    nullable?: boolean;
  }

  interface Optional<T extends Entity> extends Options<T> {
    nullable?: true;
  }
}

type One<T extends Entity> = One.Field<T>;

function One<T extends Entity>(type: Entity.Type<T>): One.Field<T>;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Optional<T>): One.Nullable<T>;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Options<T>): One.Field<T>;
function One<T extends Entity>(options: One.Optional<T>): One.Nullable<T>;
function One<T extends Entity>(options: One.Options<T>): One.Field<T>;
function One<T extends Entity>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { type: arg1 };

  return OneToManyRelation.create({ ...arg2, ...arg1 });
}

class OneToManyRelation extends Field {
  type!: Entity.Type;
  datatype = "INT";

  init(options: Partial<this>){
    super.init(options);

    if(options.column)
      return;

    const { name } = this.type.table;
    const lowerCase = (_: string, n1: string) => n1.toLowerCase();
    this.column = name.replace(/(^[A-Z])/i, lowerCase) + "Id";
  }

  join(query: Query<any>){
    let name = query.tables.get(this);

    if(!name){
      name = query.join(this.type, this.column);
      query.tables.set(this, name);
    }

    return name;
  }

  where(query: Query<any>){
    const table = this.join(query);

    return this.type.map((field) => {
      return field.where(query, table);
    })
  };

  select(query: Query<any>, path: string[]){
    const table = this.join(query);

    return this.type.map((field, key) => {
      return field.select(query, [...path, key], table);
    })
  }
}

export default One;