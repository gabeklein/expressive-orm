import { Bool } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Bool {
    interface Integer extends BooleanColumn {
      readonly type: "integer";
    }
    
    interface Text extends BooleanColumn {
      readonly type: "text";
      readonly either: [true: string, false: string];
    }
    
    interface Types {
      default: Integer;
      integer: Integer;
      text: Text;
    }
  }
}

class BooleanColumn extends Bool.Type {
  readonly type: Bool.DataType = "integer";
}

Bool.Type = BooleanColumn;