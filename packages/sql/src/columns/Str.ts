import { Field } from '../type/Field';

const VARIABLE_TYPE = new Set(["char", "varchar", "text"]);

class StringColumn extends Field<string> {
  readonly type: "char" | "varchar" | "text" | "tinytext" | "mediumtext" | "longtext" = "varchar";
  readonly length: number = 255;

  constructor(opts?: Str.Opts) {
    super(({ parent, property }) => {
      let { type = "varchar", length = 255, datatype } = opts || {};

      if(VARIABLE_TYPE.has(type!))
        if(length)
          datatype = `${datatype || type}(${length})`;
        else
          throw `Can't determine datatype! Length is not specified for ${parent.name}.${property}.`
  
      return {
        datatype,
        ...opts
      }
    });
  }

  set(value: string) {
    if (typeof value !== 'string')
      throw 'Value must be a string.';

    if (this.length && value.length > this.length)
      throw `Value length ${value.length} exceeds maximum of ${this.length}.`;

    return value;
  }
}

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

  type Any = Char | VarChar | Text | TinyText | MediumText | LongText;

  type Opts = Partial<Any>;
}

interface Str extends StringColumn {}

function Str<T extends Str.Opts>(opts?: T){
  return new StringColumn(opts) as Field.Specify<T, Str.Any, Str.VarChar>; 
}

Str.Type = StringColumn;

export { Str }