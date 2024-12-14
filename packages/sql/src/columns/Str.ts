import { Field } from '../Field';

declare namespace Str {
  interface Char extends StringLike {
    readonly type: "char";
  }

  interface VarChar extends StringLike {
    readonly type: "varchar";
  }

  interface Text extends StringLike {
    readonly type: "text";
  }

  interface TinyText extends StringLike {
    readonly type: "tinytext";
  }

  interface MediumText extends StringLike {
    readonly type: "mediumtext";
  }

  interface LongText extends StringLike {
    readonly type: "longtext";
  }

  type Type = Char | VarChar | Text | TinyText | MediumText | LongText;

  type Options = Partial<Type>;
}

function Str<T extends Str.Options>(opts?: T){
  return StringLike.new(opts) as Field.Specify<T, Str.Type, Str.VarChar>;;
}

class StringLike extends Field<string> {
  length = 255;
  type: "varchar" | "char" | "text" | "tinytext" | "mediumtext" | "longtext" = "varchar";

  get datatype(){
    const { type, length } = this;

    if(["char", "varchar", "text"].includes(type))
      if(length)
        return `${type}(${length})`;
      else
        throw `Can't determine datatype! Length is not specified for ${this.parent.name}.${this.property}.`

    return type;
  }

  set(value: string){
    const output = super.set(value);

    if(typeof value !== "string")
      throw "Value must be a string."

    // TODO: escape characters may add to length
    if(this.length && output.length > this.length)
      throw `Value length ${value.length} exceeds maximum of ${this.length}.`

    return output;
  }
}

export { Str }