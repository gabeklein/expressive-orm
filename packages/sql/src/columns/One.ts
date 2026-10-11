import { one, type Type } from '@expressive/orm';

declare module '@expressive/orm' {
  namespace one {
    interface Integer<T extends Type = Type> extends ForeignColumn<T> {
      type: "integer";
    }

    interface BigInt<T extends Type = Type> extends ForeignColumn<T> {
      type: "bigint";
    }

    interface Types {
      default: Integer;
      integer: Integer;
      bigint: BigInt;
    }
  }
}

export class ForeignColumn<T extends Type = Type> extends one.Type<T> {
  type: one.DataType = "integer";
}

one.Type = ForeignColumn;
