import { Builder, Table, Query } from '..';
import { Field } from '../type/Field';
import { underscore } from '../utils';

class ForeignColumn<T extends Table = Table> extends Field<Table.Values<T>> {
  declare readonly type: One.DataType;

  readonly entity!: Table.Type<T>;
  readonly nullable: boolean = false;
  readonly onDelete?: string;
  readonly onUpdate?: string;

  set(value: Table.Values<T> | number) {
    if (this.query?.tables.has(value))
      return (value as any)[this.reference!.column];
    
    return value;
  }

  use(query: Builder): Query.From<T> {
    // TODO: avoid any here?
    const table = query.use(this.entity) as any;
    query.where(table.id, "=", this);
    return table;
  }
}

declare namespace One {
  interface Types {}

  type DataType = keyof Types;
  
  type Options = (null | string | {
    [K in Exclude<keyof ForeignColumn, 'entity'>]?: ForeignColumn[K];
  })[]
}

interface One<T extends Table> extends ForeignColumn<T> {}

function One<T extends Table, O extends One.Options>(
  entity: Table.Type<T>, ...options: O){
  
  const field = "id";
  const column = underscore(entity.name) + "_" + field;
  const reference = entity.fields.get(field);

  return One.Type.new({ column, reference }, ...options, { entity }) as Field.Mod<O, One<T>>;
}

One.Type = ForeignColumn;

export { One };