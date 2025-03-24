import { Str } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Str {
    interface Text extends Type {
      readonly type: "text";
    }

    interface Types {
      default: Text;
      text: Text;
    }
  }
}

class StringColumn extends Str.Type {
  readonly type!: keyof Str.Types;
  readonly length?: number = undefined;

  get datatype() {
    return this.type || "text";
  }
}

Str.Type = StringColumn;