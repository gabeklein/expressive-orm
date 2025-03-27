import { assign } from '../utils';
import { Field } from './Field';
import { Type } from './Type';

declare namespace Table {
  interface Options {
    table?: string;
    schema?: string;
  }

  type Callback = (self: Type.EntityType) => Options | void;
}

function Table(name: string, opts?: Table.Options): Type.EntityType;
function Table(opts: Table.Options): Type.EntityType;
function Table(callback: Table.Callback): Type.EntityType;
function Table(arg1: string | Table.Options | Table.Callback, arg2?: Table.Options){
  return Field.does((parent) => {
    if(typeof arg1 == "string"){
      const [table, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, table };
    }
    else if(typeof arg1 == "function")
      arg1 = arg1(parent) || {};

    assign(parent, arg1);
  }) as any;
}

export { Table }