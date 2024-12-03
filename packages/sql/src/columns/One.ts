import { Field, Nullable } from '../Field';
import { Query } from '../Query';
import { Type } from '../Type';
import { underscore } from '../utils';

function One<T extends Type>(type: Type.EntityType<T>, nullable?: false): JoinOne<T>;
function One<T extends Type>(type: Type.EntityType<T>, nullable: boolean): JoinOne<T> & Nullable;
function One<T extends Type>(type: Type.EntityType<T>, nullable?: boolean){
  return JoinOne.new((key) => {
    return {
      nullable,
      entity: type,
      column: underscore(key) + "_id",
      references: {
        table: type.table,
        column: "id",
      }
    }
  });
}

class JoinOne<T extends Type> extends Field<T> {
  entity!: Type.EntityType<T>;

  type = "int";
  foreignKey = "id";

  set(value: T | number){
    if(typeof value == "number")
      return value;

    super.set(value);

    return value.id;
  }

  query(table: Query.Table): any {
    return table.query.table(this.entity, {
      id: `${table.alias || table.name}.${this.column}`
    })
  }
}

export { One, JoinOne }