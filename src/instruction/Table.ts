import Control from "../Definition";

namespace Table {
  export interface Options {
    name?: string;
    schema?: string;
  }
}

function Table(name: string, opts?: Table.Options): Control;
function Table(opts: Table.Options): Control;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  return Control.apply((parent) => {
    if(typeof arg1 == "string"){
      const [name, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, name };
    }

    Object.assign(parent, arg1);
  })
}

export default Table;