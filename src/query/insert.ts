import Entity from "..";
import { qualify } from "../utility";

export declare namespace insert { 
  type Property<T> = T extends Entity ? T | number : T;

  type Data<T extends Entity> = {
    [K in Entity.Field<T>]?: Property<T[K]>;
  }
}

export function insertQuery<T extends Entity>(
  type: Entity.Type<T>,
  data: insert.Data<T>[]){

  const { fields, table } = type;
  const keys = new Set<string>();

  const entries = data.map(insert => {
    const values = {} as { [key: string]: any };

    fields.forEach((field, key) => {
      const { column } = field;

      if(key in insert){
        const given = insert[key as Entity.Field<T>];
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

function serialize(value: any){
  switch(typeof value){
    case "undefined":
      return "default";

    case "object":
      if(value === null)
        return "NULL";
      else
        value = String(value);

    case "string":
      return `"` + value.replace(`"`, `\\"`) + `"`;

    case "number":
      return String(value);

    default:
      return "???";
  }
}