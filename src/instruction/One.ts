import { escapeId } from 'mysql';

import Entity from '../Entity';
import Field, { TYPE, VALUE } from '../Field';
import Query from '../Query';
import { lowercase, qualify, sql } from '../utility';

declare namespace One {
  type Field<T extends Entity> = T & {
    [TYPE]?: OneToManyRelation<T>;
    [VALUE]?: Query.Select<T>;
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

  proxy(query: Query<any>){
    let { type } = this;

    const fk = qualify(type.table.name, "id");
    const lk = qualify(this.table.name, this.column);

    const proxy = query.proxy(type, {
      join: "left",
      name: type.table.name,
      on: [`${fk} = ${lk}`]
    });

    return () => proxy;
  }
}

export default One;
export { OneToManyRelation };