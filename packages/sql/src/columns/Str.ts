import { Field } from '..';

const VARIABLE_TYPE = new Set(["char", "varchar", "text"]);

declare namespace Str {
  interface Char extends Str {
    readonly type: "char";
  }

  interface VarChar extends Str {
    readonly type: "varchar";
  }

  interface Text extends Str {
    readonly type: "text";
  }

  interface TinyText extends Str {
    readonly type: "tinytext";
  }

  interface MediumText extends Str {
    readonly type: "mediumtext";
  }

  interface LongText extends Str {
    readonly type: "longtext";
  }

  type Type = Char | VarChar | Text | TinyText | MediumText | LongText;

  type Options = Partial<Type>;
}

interface Str extends Field<string> {
  type: "char" | "varchar" | "text" | "tinytext" | "mediumtext" | "longtext";
  length: number;
}

function Str<T extends Str.Options>(opts?: T): Field.Specify<T, Str.Type, Str.VarChar>;
function Str<T extends Str.Options>(opts?: T){
  let { type = "varchar", length = 255, datatype } = opts || {};

  return Field<Str.Type>(({ parent, property }) => {
    if(VARIABLE_TYPE.has(type!))
      if(length)
        datatype = `${datatype || type}(${length})`;
      else
        throw `Can't determine datatype! Length is not specified for ${parent.name}.${property}.`

    return {
      type,
      length,
      datatype,
      ...opts,
      set(value: string) {
        if(typeof value !== "string")
          throw "Value must be a string."

        if(this.length && value.length > this.length)
          throw `Value length ${value.length} exceeds maximum of ${this.length}.`

        value = value
          .replace(/[\0\n\r\b\t\\'"\x1a]/g, s => (
            s == "\0" ? "\\0" :
            s == "\n" ? "\\n" :
            s == "\r" ? "\\r" :
            s == "\b" ? "\\b" :
            s == "\t" ? "\\t" :
            s == "\x1a" ? "\\Z" :
            "\\" + s
          ))
          .replace(/[\x00-\x1f\x7f-\x9f]/g, ch => (
            '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0')
          ));
    
        return `'${value}'`;
      }
    }
  }); 
}

export { Str }