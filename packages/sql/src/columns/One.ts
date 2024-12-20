import { Field, Nullable } from '../Field';
import { Query } from '../Query';
import { Type } from '../Type';
import { underscore } from '../utils';

function One<T extends Type>(type: Type.EntityType<T>, nullable?: false): JoinOne<T>;
function One<T extends Type>(type: Type.EntityType<T>, nullable: boolean): JoinOne<T> & Nullable;
function One<T extends Type>(type: Type.EntityType<T>, nullable?: boolean){
  return JoinOne.new({ entity: type, nullable });
}

class JoinOne<T extends Type> extends Field<T> {
  entity!: Type.EntityType<T>;

  type = "int";
  foreignKey = "id";

  get foreignTable(){
    return this.entity.table;
  }

  column = underscore(this.property) + "_id";

  set(value: Type.Values<T> | number){
    if(value && typeof value == "object")
      value = value.id;

    return super.set(value);
  }

  proxy(table: Query.Table): Query.Join<T> {
    return table.query.where<any>(this.entity, { id: this });
  }
}

export { One, JoinOne }