import { bool } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace bool {
    interface Integer extends BooleanColumn {
      type: "integer";
    }

    interface Text extends BooleanColumn {
      type: "text";
      either: readonly [true: string, false: string];
    }

    interface Types {
      default: Integer;
      integer: Integer;
      text: Text;
    }
  }
}

class BooleanColumn extends bool.Type {
  type: bool.DataType = "integer";
}

bool.Type = BooleanColumn;
