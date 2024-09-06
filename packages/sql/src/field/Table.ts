import { Type } from '../Type';

namespace Table {
  export interface Options {
    name?: string;
    schema?: string;
  }
}

function Table(name: string, opts?: Table.Options): Type.EntityType;
function Table(opts: Table.Options): Type.EntityType;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  return Type.add(parent => {
    if(typeof arg1 == "string"){
      const [name, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, name };
    }

    const { name, ...rest } = arg1;

    if(name)
      parent.table = name;

    Object.assign(parent, rest);
  })
}

export { Table }