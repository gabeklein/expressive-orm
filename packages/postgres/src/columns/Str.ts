import { Str } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Str {
    interface Text extends StringColumn {
      readonly type: "text";
    }
    
    interface VarChar extends StringColumn {
      readonly type: "varchar";
      readonly length: number;
    }
    
    interface Char extends StringColumn {
      readonly type: "char";
      readonly length: number;
    }

    interface UUID extends StringColumn {
      readonly type: "uuid";
    }

    interface Types {
      default: Text;
      text: Text;
      varchar: VarChar;
      char: Char;
      uuid: UUID;
    }
  }
}

class StringColumn extends Str.Type {
  readonly type: Str.DataType = "text";
  readonly collate?: string;

  get datatype() {
    let { type } = this;

    if(type.endsWith("char") && this.length)
      type += `(${this.length})`;

    if (this.collate)
      type += ` COLLATE "${this.collate}"`;

    return type;
  }

  set(value: string) {
    if (typeof value !== 'string')
      throw 'Value must be a string.';

    const { length, type } = this;

    if (type.endsWith("char") && length && value.length > length)
      throw `Value length ${value.length} exceeds maximum of ${length}.`;

    return value;
  }
}

Str.Type = StringColumn;