import { escapeId } from 'mysql';

import Entity from '../Entity';
import Query from '../Query';
import { lowercase, sql } from '../utility';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace One {
  type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation<T>;
    [WHERE]?: Query.Where<T>;
    [SELECT]?: Query.Select<T>;
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
    arg1 = { ...arg2, type: arg1 };

  return OneToManyRelation.create(arg1);
}

class OneToManyRelation<T extends Entity = Entity> extends Field {
  type!: Entity.Type;
  datatype = "INT";

  init(options: Partial<this>){
    super.init(options);

    const foreign = this.type.table;
    const foreignKey = "id";
    const local = `FK_${foreign.name}${this.table.name}`;

    this.table.dependancies.add(foreign);

    if(!options.column)
      this.column = lowercase(foreign.name) + "Id";

    this.constraint = sql`
      ADD ${local && `CONSTRAINT ${escapeId(local)}`}
      FOREIGN KEY (${this.column})
      REFERENCES ${foreign.name}(${foreignKey})
    `
  }

  join(query: Query<any>){
    let name = query.tables.get(this);

    if(!name){
      name = query.join(this.type, this.column);
      query.tables.set(this, name);
    }

    return name;
  }

  where(query: Query<any>): Query.Where<T> {
    const table = this.join(query);

    return this.type.map((field) => {
      return field.where(query, table);
    })
  };

  select(query: Query<any>, path: string[]): Query.Select<T> {
    const table = this.join(query);

    return this.type.map((field, key) => {
      return field.select(query, [...path, key], table);
    })
  }
}

export default One;
export { OneToManyRelation };