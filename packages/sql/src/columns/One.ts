import { Nullable, Query, Type } from '..';
import { Field } from '../type/Field';
import { underscore } from '../utils';

class ForeignColumn<T extends Type> extends Field<Type.Values<T>> {
  readonly entity: Type.EntityType<T>;
  readonly foreignKey: string = "id";
  readonly foreignTable: string;
  readonly nullable: boolean = false;

  constructor(type: Type.EntityType<T>, nullable?: boolean) {
    super(({ property }) => ({
      column: underscore(property) + "_id"
    }));

    this.entity = type;
    this.type = "int";
    this.foreignKey = "id";
    this.foreignTable = type.table;
    this.foreignTable = type.table;
    this.nullable = nullable || false;
  }

  set(value: Type.Values<T> | number) {
    if (this.query?.tables.has(value))
      return (value as any)[this.foreignKey];
    
    return value;
  }

  use(query: Query.Builder) {
    const table = query.use(this.entity) as any;
    query.where(table.id, "=", this);
    return table;
  }
}

interface One<T extends Type> extends ForeignColumn<T> {}

function One<T extends Type>(type: Type.EntityType<T>, nullable?: false): One<T>;
function One<T extends Type>(type: Type.EntityType<T>, nullable: boolean): One<T> & Nullable;
function One<T extends Type>(type: Type.EntityType<T>, nullable?: boolean){
  return new ForeignColumn(type, nullable);
}

One.Type = ForeignColumn;

export { One };