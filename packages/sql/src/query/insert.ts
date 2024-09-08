import { Type } from "../Type";
import { qualify } from "../utility";
import { serialize } from "./generate";

export declare namespace insert { 
  type Property<T> = T extends Type ? T | number : T;

  type Data<T extends Type> = {
    [K in Type.Field<T>]?: Property<T[K]>;
  }
}

export function insertQuery<T extends Type>(
  type: Type.EntityType<T>,
  data: insert.Data<T>[]){

  const { fields, table } = type;
  const keys = new Set<string>();

  const entries = data.map(insert => {
    const values = {} as { [key: string]: any };

    fields.forEach((field, key) => {
      const { column } = field;

      if(key in insert){
        const given = insert[key as Type.Field<T>];
        const value = field.set ? field.set(given) : given;

        keys.add(column); 
        values[column] = value;
      }
    })
    
    return values;
  });

  const tableName = qualify(table);
  const insertKeys = Array.from(keys)
    .map(k => qualify(k))
    .join(",");

  const insertValues = entries.map(entry => {
    const values = Array.from(keys)
      .map(key => serialize(entry[key]))
      .join(",");

    return "(" + values + ")";
  }).join(",");

  return `INSERT INTO ${tableName} (${insertKeys}) VALUES ${insertValues}`;
}