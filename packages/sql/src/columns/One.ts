import { Builder, Nullable, Type as Entity, Query } from '..';
import { Field } from '../type/Field';
import { underscore } from '../utils';

class ForeignColumn<T extends Entity = Entity> extends Field<Entity.Values<T>> {
  declare readonly type: One.DataType;

  readonly entity!: Entity.EntityType<T>;
  readonly nullable: boolean = false;
  readonly onDelete?: string;
  readonly onUpdate?: string;

  set(value: Entity.Values<T> | number) {
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
  
  type Options = {
    [K in Exclude<keyof ForeignColumn, 'entity'>]?: ForeignColumn[K];
  }
}

interface One<T extends Entity> extends ForeignColumn<T> {}

function One<T extends Entity>(entity: Entity.EntityType<T>, nullable?: false): One<T>;
function One<T extends Entity>(entity: Entity.EntityType<T>, nullable: boolean): One<T> & Nullable;
function One<T extends Entity, O extends One.Options>(entity: Entity.EntityType<T>, options: O): Field.Mod<[O], One<T>>;
function One<T extends Entity>(entity: Entity.EntityType<T>, arg2?: One.Options | boolean) {
  if (typeof arg2 === 'boolean')
    arg2 = { nullable: arg2 };
  
  const field = "id";
  const opts: One.Options = Object.assign({}, arg2);
  const column = opts.column || underscore(entity.name) + "_" + field;
  const reference = entity.fields.get(field);

  return One.Type.new({ ...opts, entity, reference, column });
}

One.Type = ForeignColumn;

export { One };