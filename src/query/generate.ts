import { qualify } from '../utility';
import Query from './Query';

export function generate(query: Query<any>){
  const {
    deletes,
    limit,
    selects,
    tables,
    updates,
    wheres
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
    sql += " " + generateTables(tables);

  if(wheres.length)
    sql += " WHERE" + wheres.join(" AND ");

  if(typeof limit == "number")
    sql += " " + `LIMIT ${limit}`;

  return sql;
}

function generateTables(tables: Query.Table[]){
  const [ from, ...joins ] = tables;
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