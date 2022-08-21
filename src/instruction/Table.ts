import Control from "../Definition";

namespace Table {
  export interface Options {
    name?: string;
  }
}

function Table(name: string, opts?: Table.Options): Control;
function Table(opts?: Table.Options): Control;
function Table(arg1?: string | Table.Options, arg2?: Table.Options){
  if(typeof arg1 == "string")
      arg1 = { name: arg1 };
  
  const config: Table.Options = { ...arg1, ...arg2 };

  return Control.apply((parent) => {
    if(config.name)
      parent.name = config.name;
  })
}

export default Table;