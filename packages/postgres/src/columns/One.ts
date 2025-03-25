import { One, Type as Entity } from "@expressive/sql";

declare module "@expressive/sql" {
  namespace One {
    interface Integer<T extends Entity = Entity> extends ForeignColumn<T> {
      readonly type: "integer";
    }
    
    interface BigInt<T extends Entity = Entity> extends ForeignColumn<T> {
      readonly type: "bigint";
    }
    
    interface Types {
      integer: Integer;
      bigint: BigInt;
    }
  }
}

class ForeignColumn<T extends Entity = Entity> extends One.Type<T> {
  type: One.DataType = "integer";
}

One.Type = ForeignColumn;