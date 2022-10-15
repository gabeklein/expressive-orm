import Entity from "..";
import Field from "../Field";
import { escapeString, qualify } from "../utility";
import Query, { RelevantTable } from "./Query";

export function generateSelect(
  selects: Map<Field, number | string>
){
  if(!selects.size)
    throw new Error("Nothing is selected by this query.");

  const keys = [] as string[];
  
  selects.forEach((alias, field) => {
    let select = field.qualifiedName;

    if(alias)
      select += " AS " + qualify(alias);

    keys.push(select);
  })

  return "SELECT" + keys.join(",");
}

export function generateWhere(query: Query<any>){
  if(!query.wheres.length)
    return "";
  
  const where = query.wheres.join(" AND ");

  return "WHERE " + where;
}

export function generateTables(query: Query<any>){
  const [ from, ...joins ] = query.tables;
  const lines = [] as string[];

  let fromStatement = `FROM ${qualify(from.name)}`;

  if(from.alias)
    fromStatement += ` AS ${qualify(from.alias)}`;

  lines.push(fromStatement);

  for(const table of joins){
    const { name, alias, join, on } = table;
    let statement = `JOIN ${qualify(name)}`;

    if(join && join !== "inner")
      statement = join.toUpperCase() + " " + statement;

    if(alias)
      statement += ` AS ${qualify(alias)}`;

    if(on) 
      statement += ` ON ` + on.join(" AND ");

    lines.push(statement);
  }

  return lines.join(" ");
}

export function serialize(value: any){
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

export function whereObject<T extends Entity>(
  table: string,
  entity: Entity.Type<T>,
  on?: Query.Compare<T>){

  const cond = [] as string[];
  const { fields } = entity;

  for(const key in on){
    const field = fields.get(key);
    const value = (on as any)[key];

    if(!field)
      throw new Error(`${key} is not a valid field in ${entity}`);

    const left = qualify(table) + "." + qualify(field.column);
    let right: string;

    if(value instanceof Field){
      const table = RelevantTable.get(value)!;

      right = qualify(table.name) + "." + qualify(value.column);
    }
    else
      right = typeof value == "string" ? escapeString(value) : value;

    cond.push(`${left} = ${right}`);
  }
  
  return cond;
}

export function whereFunction<T extends Entity>(
  query: Query<any>,
  on: Query.Join.Function){

  const cond = [] as string[];
  const add = (op: string, left: Field, right: any) => {
    cond.push(`${left.qualifiedName} ${op} ${right.qualifiedName}`);
  }

  query.pending.unshift(() => {
    const where = (field: any) => {
      if(field instanceof Field)
        return {
          is: add.bind(null, "=", field),
          not: add.bind(null, "<>", field),
          greater: add.bind(null, ">", field),
          less: add.bind(null, "<", field),
        }
      else
        throw new Error("Join assertions can only apply to fields.");
    }

    on(where);
  });
  
  return cond;
}