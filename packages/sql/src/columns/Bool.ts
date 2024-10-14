import { Field } from '../Field';

declare namespace Bool {
  interface OrNull extends Bool {
    nullable: true;
  }
}

interface Bool extends Field {
  either?: readonly [string, string];
}

function Bool(options: Bool.OrNull): Bool.OrNull;
function Bool(options?: Bool): Bool;
function Bool(column: string, nullable?: true): Bool.OrNull;
function Bool(column: string, nullable: boolean): Bool;
function Bool(options: Bool | string = {}, nullable?: boolean){
  let isTrue: any = 1;
  let isFalse: any = 0;
  let datatype = "tinyint";

  if(typeof options == "string")
    options = { column: options };

  if(options.either){
    [isTrue, isFalse] = options.either;

    datatype = `varchar(${
      Math.max(isTrue.length, isFalse.length)
    })`
  }

  return Field({
    nullable,
    ...options,
    datatype,
    get(value: unknown){
      return value === isTrue;
    },
    set(value: unknown){
      if(typeof value != "boolean")
        throw "Value must be a boolean."

      return value ? isTrue : isFalse;
    }
  });
}

export { Bool }