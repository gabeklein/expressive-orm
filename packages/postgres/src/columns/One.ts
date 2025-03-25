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

  constraints?: string;

  get datatype() {
    const { onDelete, onUpdate } = this;
    
    // Add constraint information if needed
    if (onDelete || onUpdate) {
      const constraints = [];
      if (onDelete) constraints.push(`ON DELETE ${onDelete}`);
      if (onUpdate) constraints.push(`ON UPDATE ${onUpdate}`);
      
      // This would be used in schema generation
      this.constraints = constraints.join(' ');
    }
    
    return this.type;
  }
}

One.Type = ForeignColumn;