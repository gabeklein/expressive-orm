import Entity from "..";
import Field from "../Field";
import { escapeString, qualify } from "../utility";
import Query from "./Query";

export function generateCombined(query: Query<any>){
  const {
    tables,
    limit,
    selects,
    deletes,
    updates
  } = query;

  let sql = "";

  if(selects){
    if(!selects.size)
      throw new Error("Nothing is selected by this query.");

    const keys = [] as string[];
    
    selects.forEach((alias, field) => {
      let select = String(field);

      if(alias)
        select += " AS " + qualify(alias);

      keys.push(select);
    })

    sql += "SELECT " + keys.join(",");
  }
  else if(updates){
    const tableName = qualify(updates.table);
    const updated = [] as string[];

    updates.values.forEach((value, field) => {
      const key = qualify(field.column);
      const output = serialize(field.set ? field.set(value) : value);

      updated.push(`${key} = ${output}`);
    })

    sql += `UPDATE ${tableName} SET ${updated.join(", ")}`;
  }
  else if(deletes){
    const targets = [] as string[];

    deletes.forEach(table => {
      targets.push(table.alias || table.name)
    })

    sql += `DELETE ${targets.join(", ")}`;
  }

  if(selects || tables.length > 1 || tables[0].alias)
    sql += " " + generateTables(query);

  sql += " " + generateWhere(query);

  if(typeof limit == "number")
    sql += " " + `LIMIT ${limit}`;

  return sql;
}

function generateWhere(query: Query<any>){
  if(!query.wheres.length)
    return "";
  
  const where = query.wheres.join(" AND ");

  return "WHERE " + where;
}

function generateTables(query: Query<any>){
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

    if(!field)
      throw new Error(`${key} is not a valid field in ${entity}`);

    const value = (on as any)[key];
    const right = typeof value == "string" ? escapeString(value) : value;
    const left = qualify(table) + "." + qualify(field.column);

    cond.push(`${left} = ${right}`);
  }
  
  return cond;
}

export function whereFunction(
  query: Query<any>,
  on: Query.Join.Function){

  const cond = [] as string[];
  const add = (op: string, left: Field, right: any) => {
    cond.push(`${left} ${op} ${right}`);
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