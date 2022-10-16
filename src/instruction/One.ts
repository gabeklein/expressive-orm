import { escapeId } from 'mysql';

import Entity from '../Entity';
import Field from '../Field';
import Query from '../query/Query';
import { decapitalize, qualify, sql } from '../utility';
import Column from './Column';

declare namespace One {
  interface Options<T extends Entity> extends Column.Options {
    type?: Entity.Type<T>;
  }

  type Nullable<T extends Entity> = Options<T> & { nullable: true };
}

function One<T extends Entity>(type: Entity.Type<T>): T;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Nullable<T>): T | null | undefined;
function One<T extends Entity>(type: Entity.Type<T>, options: One.Options<T>): T;
function One<T extends Entity>(options: One.Nullable<T>): T | null | undefined;
function One<T extends Entity>(options: One.Options<T>): T;
function One<T extends Entity>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return OneToManyRelation.create(arg1);
}

class OneToManyRelation extends Field {
  type!: Entity.Type;
  datatype = "INT";

  init(options: Partial<this>){
    super.init(options);

    const foreign = this.type.ensure();
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

    const fk = qualify(type.table, "id");
    const lk = qualify(this.table.name, this.column);

    const proxy = query.table(type, "left", [`${fk} = ${lk}`]);

    return () => proxy;
  }
}

export default One;
export { OneToManyRelation };