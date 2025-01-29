import { Field } from '..';

declare namespace Bool {
  interface TinyInt extends Field<boolean> {
    readonly type: "tinyint"; 
  }

  interface Char extends Field<boolean> {
    readonly type: "varchar";
    either: [true: string, false: string];
  }

  type Type = TinyInt | Char;

  type Options = Partial<Type>;
}

function Bool<T extends Bool.Options>(opts?: T): Field.Specify<T, Bool.Type>;
function Bool<T extends Bool.Options>(opts = {} as T){
  let type = "tinyint";
  let datatype = "tinyint";
  let YES: string | number = 1;
  let NO: string | number = 0;

  if("either" in opts && opts.either){
    [ YES, NO ] = opts.either;
    type = "varchar";
    datatype = `varchar(${Math.max(YES.length, NO.length)})`;
  }

  return Field({
    type,
    datatype,
    ...opts as any,
    get(value: unknown){
      return value === YES;
    },
    set(value: boolean){
      if(typeof value == "boolean")
        return value ? YES : NO;

      throw "Value must be a boolean.";
    }
  });
}

export { Bool }