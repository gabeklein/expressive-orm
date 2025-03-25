import { Builder, Nullable, Type as Entity } from '..';
import { Field } from '../type/Field';
import { underscore } from '../utils';

class ForeignColumn<T extends Entity = Entity> extends Field<Entity.Values<T>> {
  declare readonly type: One.DataType;

  readonly entity!: Entity.EntityType<T>;
  readonly nullable: boolean = false;
  readonly onDelete?: string;
  readonly onUpdate?: string;

  get column() {
    return underscore(this.property) + "_id";
  }

  set(value: Entity.Values<T> | number) {
    if (this.query?.tables.has(value))
      return (value as any)[this.reference!.column];
    
    return value;
  }

  use(query: Builder) {
    // TODO: avoid any here?
    const table = query.use(this.entity) as any;
    query.where(table.id, "=", this);
    return table;
  }
}

declare namespace One {
  interface Types {}

  type DataType = keyof Types;
  
  type Options = {
    [K in Exclude<keyof ForeignColumn, 'entity'>]?: ForeignColumn[K];
  }
}

interface One<T extends Entity> extends ForeignColumn<T> {}

// Modified function with flexible second parameter
function One<T extends Entity>(entity: Entity.EntityType<T>, nullable?: false): One<T>;
function One<T extends Entity>(entity: Entity.EntityType<T>, nullable: boolean): One<T> & Nullable;
function One<T extends Entity, O extends One.Options>(entity: Entity.EntityType<T>, options: O): Field.Modifier<O, One<T>>;
function One<T extends Entity>(entity: Entity.EntityType<T>, arg2?: One.Options | boolean) {
  if (typeof arg2 === 'boolean')
    arg2 = { nullable: arg2 };
  
  const opts: One.Options = Object.assign({}, arg2);
  const reference = entity.fields.get("id");

  return One.Type.new({ entity, reference, ...opts });
}

One.Type = ForeignColumn;

export { One };