// packages/postgres/src/columns/Bool.ts
import { Bool } from '@expressive/sql';

declare module "@expressive/sql" {
  namespace Bool {
    interface Boolean extends BooleanColumn {
      readonly type: "boolean";
    }
    
    interface VarChar extends BooleanColumn {
      readonly type: "varchar";
    }
    
    interface Types {
      default: Boolean;
      boolean: Boolean;
      varchar: VarChar;
    }
  }
}

class BooleanColumn extends Bool.Type {
  readonly type!: Bool.DataType;
  
  get datatype() {
    if (this.type === "varchar" && this.either) {
      const [TRUE, FALSE] = this.either;
      return `varchar(${Math.max(TRUE.length, FALSE.length)})`;
    }
    
    return this.type || "integer";
  }
}

Bool.Type = BooleanColumn;