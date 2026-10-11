import { bool } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace bool {
    interface Boolean extends BooleanColumn {
      type: "boolean";
    }

    interface Integer extends BooleanColumn {
      type: "integer";
    }

    interface Text extends BooleanColumn {
      type: "text";
      either: readonly [true: string, false: string];
    }

    interface VarChar extends BooleanColumn {
      type: "varchar";
      either: readonly [true: string, false: string];
    }

    interface Types {
      default: Boolean;
      boolean: Boolean;
      integer: Integer;
      text: Text;
      varchar: VarChar;
    }
  }
}

export class BooleanColumn extends bool.Type {
  type: bool.DataType = "boolean";

  get datatype() {
    const { type, either } = this;

    if (type === "varchar" && either) {
      const [TRUE, FALSE] = either.map(String);
      return `varchar(${Math.max(TRUE.length, FALSE.length)})`;
    }

    return type;
  }

  set(value: unknown) {
    const out = super.set(value);

    if (out == null || this.either || this.type !== "boolean")
      return out;

    return value as boolean;
  }
}

bool.Type = BooleanColumn;
