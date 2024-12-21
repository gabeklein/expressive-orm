import { Field } from '../Field';

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

function Str<T extends Str.Options>(opts?: T){
  type Spec = Field.Specify<T, Str.Type, Str.VarChar>;

  let { type = "varchar", length = 255, datatype } = opts || {};

  return Field<Str.Type>(self => {
    const { set } = self;

    if(VARIABLE_TYPE.has(type!))
      if(length)
        datatype = `${datatype || type}(${length})`;
      else
        throw `Can't determine datatype! Length is not specified for ${self.parent.name}.${self.property}.`

    return {
      type,
      length,
      datatype,
      ...opts,
      set(value: string){
        const output = set.call(self, value);
  
        if(typeof value !== "string")
          throw "Value must be a string."
  
        // TODO: escape characters may add to length
        if(this.length && output.length > this.length)
          throw `Value length ${value.length} exceeds maximum of ${this.length}.`
  
        return output;
      }
    }
  }) as Spec; 
}

export { Str }