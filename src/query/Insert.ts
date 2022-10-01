import Entity from "..";
import { qualify } from "../utility";
import Query from "./Query";

declare namespace Insert {
  type Expect<T extends Entity> = { [K in Entity.Field<T>]?: T[K] };
  type Function<T extends Entity> = (where: Query.Where, entity: T) => Expect<T>;
  type Values<T extends Entity> = Expect<T> | Expect<T>[];
}

export default Insert;

export function insertQuery<T extends Entity>(
  into: Entity.Type<T>, data: Insert.Values<T>){

  const { fields } = into.table!;

  if(!Array.isArray(data))
    data = [data];

  const include = new Set<string>();
  const entries = data.map(insert => {
    const values = {} as { [key: string]: any };

    fields.forEach((field, key) => {
      const { column } = field;

      if(key in insert){
        const given = insert[key as Entity.Field<T>];
        const value = field.set ? field.set(given) : given;

        include.add(column); 
        values[column] = value;
      }
    })
    
    return values;
  });

  return generate(into.name, include, entries);
}

function generate(
  table: string,
  include: Set<string>,
  entries: { [key: string]: any }[]
){
  const keys = Array.from(include);
  const tableName = qualify(table);

  const insertKeys = keys
    .map(k => qualify(k))
    .join(",");

  const insertValues = entries.map(entry => {
    const values = keys
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