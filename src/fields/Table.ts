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
  return Entity.field((parent) => {
    if(typeof arg1 == "string"){
      const [name, schema] = arg1.split(".").reverse();

      arg1 = { schema, ...arg2, name };
    }

    const { name, schema, ...rest } = arg1;

    Object.assign(parent, rest, {
      tableName: name,
      schemaName: schema
    });
  })
}

export default Table;