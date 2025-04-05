import { Str } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Str {
    interface Text extends StringColumn {
      readonly type: "text";
    }

    interface Types {
      default: Text;
      text: Text;
    }
  }
}

class StringColumn extends Str.Type {
  readonly type = "text";
}

Str.Type = StringColumn;