import { str } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace str {
    interface Text extends StringColumn {
      type: "text";
    }

    interface Types {
      default: Text;
      text: Text;
    }
  }
}

class StringColumn extends str.Type {
  type: str.DataType = "text";
}

str.Type = StringColumn;
