import { Query, Field, Nullable, Type } from '..';
import { underscore } from '../utils';

interface One<T extends Type> extends Field<Type.Values<T>> {
  entity: Type.EntityType<T>;
  proxy(table: Query.Table): Query.Join<T>;
  set(value: Type.Values<T> | number): void;
}

function One<T extends Type>(type: Type.EntityType<T>, nullable?: false): One<T>;
function One<T extends Type>(type: Type.EntityType<T>, nullable: boolean): One<T> & Nullable;
function One<T extends Type>(type: Type.EntityType<T>, nullable?: boolean){
  return Field<One<T>>(self => {
    const { set } = self;

    return {
      nullable,
      entity: type,
      column: underscore(self.property) + "_id",
      type: "int",
      foreignKey: "id",
      foreignTable: type.table,
      set(value: Type.Values<T> | number){
        if(value && typeof value == "object")
          value = value.id;
  
        return set.call(self, value);
      },
      proxy(this: One<T>, table: Query.Table){
        return table.query.where<any>(type, { id: this });
      }
    }
  });
}

export { One }