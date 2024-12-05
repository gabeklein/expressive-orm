import { Field, Nullable } from '../Field';

const TRUE = 1;
const FALSE = 0;

declare namespace Bool {
  interface TinyInt extends Field {
    readonly type: "tinyint"; 
  }
}

function Bool(column: string, nullable: boolean): Bool.TinyInt;
function Bool(column?: string, nullable?: true): Bool.TinyInt & Nullable;
function Bool(column?: string, nullable?: boolean){
  return Field.new({
    nullable,
    column,
    type: "tinyint",
    get(value: unknown){
      return value === TRUE;
    },
    set(value: boolean){
      super.set(value);

      if(typeof value != "boolean")
        throw "Value must be a boolean."

      return value ? TRUE : FALSE;
    }
  });
}

export { Bool }