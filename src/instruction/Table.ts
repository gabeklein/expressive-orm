import TableDefinition from "../Table";

namespace Table {
  export interface Options {
    name?: string;
    schema?: string;
  }
}

function Table(name: string, opts?: Table.Options): TableDefinition;
function Table(opts: Table.Options): TableDefinition;
function Table(arg1: string | Table.Options, arg2?: Table.Options){
  return TableDefinition.use((parent) => {
    if(typeof arg1 == "string"){
      const [name, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, name };
    }

    Object.assign(parent, arg1);
  })
}

export default Table;