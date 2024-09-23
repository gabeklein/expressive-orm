import { Type } from "../Type";
import { Knex } from "knex";

export declare namespace insert { 
  type Property<T> = T extends Type ? T | number : T;

  type Data<T extends Type> = {
    [K in Type.Field<T>]?: Property<T[K]>;
  }
}

export function insert<T extends Type>(
  type: Type.EntityType<T>,
  data: insert.Data<T>[] | number,
  mapper?: (i: any) => Type.Insert<T>
): Knex.QueryBuilder {
  const { fields, table, connection } = type;
  
  if(!connection)
    throw new Error("weird");

  const knex = connection!.knex;
  
  if(mapper)
    data = typeof data == "number"
      ? Array.from({ length: data }, (_, i) => mapper(i))
      : data.map(mapper);

  else if(typeof data == "number")
    throw new Error("Cannot insert a number without a map function!");

  else if(!Array.isArray(data))
    data = [data];

  const insertData = data.map(insert => {
    const values: Record<string, any> = {};

    fields.forEach((field, key) => {
      const { column } = field;

      if (key in insert) {
        const given = insert[key as Type.Field<T>];
        const value = field.set ? field.set(given) : given;

        values[column] = value;
      }
    });

    return values;
  });

  const query = knex(table).insert(insertData);

  // console.log(`Will send:\n${query.toQuery()}`);
  
  return query;
}