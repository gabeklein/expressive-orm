import { One, Table } from "@expressive/sql";

declare module "@expressive/sql" {
  namespace One {
    interface Integer<T extends Table = Table> extends ForeignColumn<T> {
      readonly type: "integer";
    }
    
    interface BigInt<T extends Table = Table> extends ForeignColumn<T> {
      readonly type: "bigint";
    }
    
    interface Types {
      integer: Integer;
      bigint: BigInt;
    }
  }
}

class ForeignColumn<T extends Table = Table> extends One.Type<T> {
  type: One.DataType = "integer";
}

One.Type = ForeignColumn;