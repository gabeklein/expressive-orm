import { Str } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Str {
    type Something = 4;

    interface Base {
      readonly collate?: string;
    }

    interface Text extends Base {
      readonly type: "text";
    }
    
    interface VarChar extends Base {
      readonly type: "varchar";
      readonly length: number;
    }
    
    interface Char extends Base {
      readonly type: "char";
      readonly length: number;
    }

    interface Types {
      default: Text;
      text: Text;
      varchar: VarChar;
      char: Char;
    }
  }
}

class StringColumn extends Str.Type implements Str.Base {
  readonly collate?: string;

  constructor(opts?: Str.Opts) {
    let { datatype, type = "text", length, collate } = opts || {};

    if (!datatype) {
      datatype =
        type === "varchar" && length ? `varchar(${length})` :
        type === "char" && length ? `char(${length})` :
        type;

      if (collate)
        datatype += ` COLLATE "${collate}"`;
    }

    super({ ...opts, type, datatype });
    Object.assign(this, opts, { type, datatype });
  }

  set(value: string) {
    if (typeof value !== 'string')
      throw 'Value must be a string.';

    if (this.type.endsWith("char") && this.length && value.length > this.length)
      throw `Value length ${value.length} exceeds maximum of ${this.length}.`;

    return value;
  }
}

Str.Type = StringColumn;