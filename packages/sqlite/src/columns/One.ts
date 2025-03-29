import { One, Table } from "@expressive/sql";

// Postgres package
declare module "@expressive/sql" {
  namespace One {
    interface Integer<T extends Table = Table> extends ForeignColumn<T> {
      readonly type: "integer";
    }
    
    interface Types {
      default: Integer;
      integer: Integer;
    }
  }
}

class ForeignColumn<T extends Table = Table> extends One.Type<T> {
  type: One.DataType = "integer";
}

One.Type = ForeignColumn;