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
  let YES = "1";
  let NO = "0";

  if("either" in opts && opts.either){
    [ YES, NO ] = opts.either;
    type = "varchar";
    datatype = `varchar(${Math.max(YES.length, NO.length)})`;
  }

  return Field(self => {
    const { set } = self;
    return {
      type,
      datatype,
      ...opts,
      get(value: unknown){
        return String(value) === YES;
      },
      set(value: boolean){
        const output = set.call(self, value);
  
        if(typeof value != "boolean")
          throw "Value must be a boolean."
  
        return output ? YES : NO;
      }
    }
  });
}

export { Bool }