import { Type } from "../Type";
import { Knex } from "knex";

export function insert<T extends Type>(
  type: Type.EntityType<T>,
  data: Type.Insert<T>[]
): Knex.QueryBuilder {
  const { fields, table, connection } = type.ready();

  const insertData = data.map((insert, index) => {
    const values: Record<string, any> = {};

    fields.forEach((field, key) => {
      const given = insert[key as Type.Field<T>];
      const which = data.length > 1 ? ` on index [${index}]` : ""

      if(given == null){
        if(field.nullable || field.default || field.primary)
          return

        throw new Error(
          `Provided value for ${type}.${key} is ${given}${which} but column is not nullable.`
        );
      }

      const value = field.set ? field.set(given) : given;
      const issue = field.accept && field.accept(value, key);

      if(issue === false || typeof issue === "string"){
        let message = `Provided value for ${type}.${key} is ${value}${which} but not acceptable for type ${field.datatype}.`;

        if(issue)
          message += ` ${issue}`;

        throw new Error(message);
      }

      values[field.column] = value;
    });

    return values;
  });
  
  if(!connection)
    throw new Error("No connection found for type");

  const { knex } = connection;

  return knex(table).insert(insertData);
}