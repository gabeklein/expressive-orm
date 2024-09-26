import { escapeId } from 'sqlstring';

import { Field } from '../Field';
import { Query } from '../Query';
import { Type } from '../Type';
import { decapitalize, sql } from '../utility';

declare namespace One {
  interface Options<T extends Type> extends Field.Options {
    type?: Type.EntityType<T>;
  }

  type Nullable<T extends Type> = Options<T> & { nullable: true };
}

function One<T extends Type>(type: Type.EntityType<T>): T;
function One<T extends Type>(type: Type.EntityType<T>, options: One.Nullable<T>): T | null | undefined;
function One<T extends Type>(type: Type.EntityType<T>, options: One.Options<T>): T;
function One<T extends Type>(type: Type.EntityType<T>, column: string, nullable: true): string | null | undefined;
function One<T extends Type>(type: Type.EntityType<T>, column: string, nullable?: boolean): string;
function One<T extends Type>(options: One.Nullable<T>): T | null | undefined;
function One<T extends Type>(options: One.Options<T>): T;
function One<T extends Type>(arg1: any, arg2?: any, arg3?: any): any {
  if(typeof arg2 == "string")
    arg2 = { column: arg2 };

  if(arg2 && typeof arg3 == "boolean")
    arg2.nullable = arg3;

  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return OneToManyRelation.create(arg1);
}

class OneToManyRelation extends Field {
  type!: Type.EntityType;
  datatype = "INT";

  init(options: Partial<this>){
    super.init(options);

    const foreign = this.type.ready();
    const foreignKey = "id";
    const local = `FK_${foreign.name}${this.table.name}`;

    this.table.deps.add(foreign);

    if(!options.column)
      this.column = decapitalize(foreign.name) + "Id";

    this.constraint = sql`
      ADD ${local && `CONSTRAINT ${escapeId(local)}`}
      FOREIGN KEY (${this.column})
      REFERENCES ${foreign.name}(${foreignKey})
    `
  }

  proxy(query: Query){
    let { type } = this;

    const fk = `${type.table}.id`;
    const lk = `${this.table.name}.${this.column}`;

    // @ts-ignore
    const proxy = query.table(type, [`${fk} = ${lk}`], "left");

    return () => proxy;
  }
}

export { One }