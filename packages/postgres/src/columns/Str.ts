import { str } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace str {
    interface Text extends StringColumn {
      type: "text";
    }

    interface VarChar extends StringColumn {
      type: "varchar";
      length: number;
    }

    interface Char extends StringColumn {
      type: "char";
      length: number;
    }

    interface UUID extends StringColumn {
      type: "uuid";
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

class StringColumn extends str.Type {
  type: str.DataType = "text";

  get datatype() {
    let { type, length, collate } = this;

    if (type.endsWith("char") && length)
      type += `(${length})`;

    if (collate)
      type += ` COLLATE "${collate}"`;

    return type;
  }
}

str.Type = StringColumn;
