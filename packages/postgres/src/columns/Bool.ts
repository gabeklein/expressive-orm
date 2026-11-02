import { bool } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace bool {
    interface Boolean extends BooleanColumn {
      type: "boolean";
    }

    interface VarChar extends BooleanColumn {
      type: "varchar";
      either: readonly [true: string, false: string];
    }

    interface Types {
      default: Boolean;
      boolean: Boolean;
      varchar: VarChar;
    }
  }
}

class BooleanColumn extends bool.Type {
  type: bool.DataType = "boolean";

  get datatype() {
    if (this.type === "varchar" && this.either) {
      const [TRUE, FALSE] = this.either.map(String);
      return `VARCHAR(${Math.max(TRUE.length, FALSE.length)})`;
    }

    return this.type;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (out == null || this.either)
      return out;

    return value as boolean;
  }
}

bool.Type = BooleanColumn;
