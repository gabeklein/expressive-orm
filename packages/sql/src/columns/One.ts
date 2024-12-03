import { Knex } from 'knex';
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
  column = underscore(this.property) + "_id";

  input(value: T | number){
    if(typeof value == "number")
      return value;

    super.input(value);

    return value.id;
  }

  query(table: Query.Table): any {
    return table.query.use(this.entity, {
      id: `${table.alias || table.name}.${this.column}`
    });
  }

  register(table: Knex.CreateTableBuilder){
    const { foreignKey, entity } = this;
    const column = super.register(table);

    if(!column)
      throw new Error(`Column ${this.property} has no datatype.`);

    column.references(foreignKey).inTable(entity.table);
    
    return column;
  }
}

export { One, JoinOne }