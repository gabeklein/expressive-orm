import { Str } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Str {
    interface Text extends Base {
      readonly type: "text";
    }

    interface Types {
      default: Text;
      text: Text;
    }
  }
}

class StringColumn extends Str.Type implements Str.Base {
  readonly type: Str.Type = "text";
  readonly length?: number = undefined;
}

Str.Type = StringColumn;