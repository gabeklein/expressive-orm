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
    super.set(value);

    if(typeof value !== "string")
      throw "Value must be a string."

    if(this.length && value.length > this.length)
      throw `Value length ${value.length} exceeds maximum of ${this.length}.`

    return value;
  }
}

// Str.char = (length = 255) =>
//   StringLike.new({ length }) as Str.Char;

// Str.varchar = (length = 255) =>
//   StringLike.new({ length, type: "varchar" }) as Str.VarChar;

// Str.text = (options?: Partial<Str.Text>) =>
//   StringLike.new(options);

// Str.tiny = (opts?: Partial<Str.TinyText>) =>
//   StringLike.new({ ...opts, type: "tinytext" }) as Str.TinyText;

// Str.medium = (opts?: Partial<Str.MediumText>) =>
//   StringLike.new({ ...opts, type: "mediumtext" }) as Str.MediumText;

// Str.long = (opts?: Partial<Str.LongText>) =>
//   StringLike.new({ ...opts, type: "longtext" }) as Str.LongText;

export { Str }