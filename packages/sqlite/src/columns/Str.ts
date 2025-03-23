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
  readonly length?: number = undefined;

  constructor(opts?: Str.Opts) {
    let { type = "text", datatype = type, length } = opts || {};
    super({ ...opts, type, datatype });
    this.length = length;
  }
}

Str.Type = StringColumn;