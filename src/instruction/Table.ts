import Control from "../Definition";

namespace Table {
  export interface Options {
    name?: string;
  }
}

function Table(name: string, opts?: Table.Options): Control;
function Table(opts: Table.Options): Control;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  const config: Table.Options = 
    typeof arg1 == "string"
      ? { ...arg2, name: arg1 }
      : arg1;

  return Control.apply((parent) => {
    if(config.name)
      parent.name = config.name;
  })
}

export default Table;