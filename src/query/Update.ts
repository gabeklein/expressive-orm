import Entity from '../Entity';
import Field from '../Field';
import { qualify } from '../utility';
import { generateTables, generateWhere, serialize } from './generate';
import Query from './Query';

declare namespace Update {
  type Expect<T extends Entity> = { [K in Entity.Field<T>]?: T[K] };
  type Values<T extends Entity> = Expect<T> | Expect<T>[];
  type Function<T extends Entity> = (where: Query.Where, entity: Query.Type<T>) => Values<T>;
}

class Update<T extends Entity> extends Query {
  values: Map<Field, any>;

  constructor(
    public type: Entity.Type<T>,
    from: Update.Function<T>){

    super();
    type.ensure()

    const entity = this.table(type, "inner");
    const update = from(this.interface, entity);
    const values = this.values = {} as any;

    this.commit();

    Object.entries(update).forEach((entry) => {
      const [key, value] = entry;
      const field = this.type.fields.get(key);

      if(!field)
        throw new Error(
          `Property ${key} has no corresponding field in entity ${type.name}`
        );

      values[field.column] = field.set ? field.set(value) : value;
    });
  }

  toString(){
    const tableName = qualify(this.type.table);
    const values = [] as string[];

    Object.entries(this.values).forEach(([column, value]) => {
      values.push(`${qualify(column)} = ${serialize(value)}`);
    })

    let sql = `UPDATE ${tableName} SET ${values.join(", ")}`;

    if(this.tables.length > 1 || this.tables[0].alias)
      sql += " " + generateTables(this);

    sql += " " + generateWhere(this);

    return sql;
  }
}

export default Update;