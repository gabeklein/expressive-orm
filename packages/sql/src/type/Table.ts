import { assign } from '../utils';
import { Field } from './Field';
import { Type } from './Type';

namespace Table {
  export interface Options {
    table?: string;
    schema?: string;
  }
}

function Table(name: string, opts?: Table.Options): Type.EntityType;
function Table(opts: Table.Options): Type.EntityType;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  return Field.does((parent) => {
    if(typeof arg1 == "string"){
      const [table, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, table };
    }

    assign(parent, arg1);
  }) as any;
}

export { Table }