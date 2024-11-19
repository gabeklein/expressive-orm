import { Field } from '../Field';
import { Query } from '../Query';
import { Type } from '../Type';
import { underscore } from '../utils';

declare namespace One {
  interface OrNull<T extends Type> extends One<T> {
    nullable: true;
  }
}

interface One<T extends Type> extends Field {
  datatype: "INT";
  type: Type.EntityType<T>;
}

function One<T extends Type>(type: Type.EntityType<T>, options?: One<T>): T;
function One<T extends Type>(type: Type.EntityType<T>, options: One.OrNull<T>): T | null | undefined;
function One<T extends Type>(options: One.OrNull<T>): T | null | undefined;
function One<T extends Type>(options: One<T>): T;
function One<T extends Type>(arg1: any, arg2?: any, arg3?: any): any {
  if(typeof arg2 == "string")
    arg2 = { column: arg2 };

  if(arg2 && typeof arg3 == "boolean")
    arg2.nullable = arg3;

  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return Field((key) => ({
    datatype: "int",
    type: arg1.type,
    column: underscore(key) + "_id",
    references: {
      table: arg1.type.table,
      column: "id",
    },
    set(value: number | { id: number }){
      return typeof value == "object" ? value.id : value;
    },
    query(table, property){
      let inner: Query.From<T> | undefined;

      Object.defineProperty(table.proxy, property, {
        get: () => inner || (
          inner = table.query.table(arg1.type, {
            id: `${table.alias || table.name}.${this.column}`
          })
        )
      })
    },
    ...arg1
  }));
}

export { One }