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

        include.add(column); 

        values[column] = field.set
          ? field.set(given)
          : given;
      }
    })
    
    return values;
  });

  const keys = Array.from(include);
  const tableName = qualify(into.name);

  const insertKeys = keys.map(k => qualify(k));
  const insertValues = entries.map(entry => {
    const values = keys
      .map(key => serialize(entry[key]))
      .join(", ");

    return "(" + values + ")";
  });

  const sql = 
    `INSERT INTO ${tableName}\n\t(${insertKeys.join(", ")})\n` +
    `VALUES\n\t` + insertValues.join(",\n\t");

  return sql.replace(/\t/g, "  ");
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