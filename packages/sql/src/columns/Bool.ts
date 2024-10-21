import { Field } from '../Field';

declare namespace Bool {
  interface OrNull extends Bool {
    nullable: true;
  }
}

interface Bool extends Field {}

function Bool(column: string, nullable: boolean): Bool;
function Bool(column?: string, nullable?: true): Bool.OrNull;
function Bool(column?: string, nullable?: boolean){
  const TRUE = 1;
  const FALSE = 0;

  return Field({
    nullable,
    column,
    datatype: "tinyint",
    get(value: unknown){
      return value === TRUE;
    },
    set(value: unknown){
      if(typeof value != "boolean")
        throw "Value must be a boolean."

      return value ? TRUE : FALSE;
    }
  });
}

export { Bool }