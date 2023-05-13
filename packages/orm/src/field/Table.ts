import Entity from '..';

namespace Table {
  export interface Options {
    name?: string;
    schema?: string;
  }
}

function Table(name: string, opts?: Table.Options): Entity.Type;
function Table(opts: Table.Options): Entity.Type;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  return Entity.add(parent => {
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

export default Table;