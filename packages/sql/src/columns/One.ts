import { Query, Field, Nullable, Type } from '..';
import { underscore } from '../utils';

interface One<T extends Type> extends Field<Type.Values<T>> {
  entity: Type.EntityType<T>;
  use(this: One<T>, query: Query.Builder): Query.Join<T>;
  set(value: Type.Values<T> | number): void;
}

function One<T extends Type>(type: Type.EntityType<T>, nullable?: false): One<T>;
function One<T extends Type>(type: Type.EntityType<T>, nullable: boolean): One<T> & Nullable;
function One<T extends Type>(type: Type.EntityType<T>, nullable?: boolean){
  return Field<One<T>>(({ property }) => ({
    nullable,
    entity: type,
    column: underscore(property) + "_id",
    type: "int",
    foreignKey: "id",
    foreignTable: type.table,
    set(value: Type.Values<T> | number){
      return value && typeof value == "object" ? value.id : value;
    },
    use(query){
      return query.join(type, { id: this });
    }
  }));
}

export { One }