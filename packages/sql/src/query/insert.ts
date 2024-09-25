import { Type } from "../Type";
import { Knex } from "knex";

export function insert<T extends Type>(
  type: Type.EntityType<T>,
  data: Type.Insert<T>[]
): Knex.QueryBuilder {
  const { table, connection } = type.ready();
  const insertData = sanitize(type, data);
  
  if(!connection)
    throw new Error("No connection found for type");

  return connection.knex(table).insert(insertData);
}

export function sanitize<T extends Type>(
  type: Type.EntityType<T>,
  data: Type.Insert<T>[]
): Record<string, unknown>[] {
  const { fields } = type.ready();

  return data.map((insert, index) => {
    const values: Record<string, any> = {};

    fields.forEach((field, key) => {
      const given = insert[key as Type.Field<T>] as unknown;
      const which = data.length > 1 ? ` on index [${index}]` : ""

      if(given == null){
        if(field.nullable || field.default || field.primary)
          return

        throw new Error(
          `Provided value for ${type}.${key} is ${given}${which} but column is not nullable.`
        );
      }

      try {
        const value = field.set ? field.set(given) : undefined;
        values[field.column] = value === undefined ? given : value;
      }
      catch(err: unknown){
        let message = `Provided value for ${type}.${key}${which} but not acceptable for type ${field.datatype}.`;

        if(typeof err == "string")
          message += `\n${err}`;

        throw err instanceof Error ? err : new Error(message);
      }
    });

    return values;
  });
}