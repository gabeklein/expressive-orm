import { One, Type as Entity } from "@expressive/sql";

// Postgres package
declare module "@expressive/sql" {
  namespace One {
    interface Integer<T extends Entity = Entity> extends ForeignColumn<T> {
      readonly type: "integer";
    }
    
    interface BigInt<T extends Entity = Entity> extends ForeignColumn<T> {
      readonly type: "bigint";
    }
    
    interface Types {
      default: Integer;
      integer: Integer;
      bigint: BigInt;
    }
  }
}

class ForeignColumn<T extends Entity = Entity> extends One.Type<T> {
  type: One.DataType = "integer";
}

One.Type = ForeignColumn;