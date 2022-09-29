import Query from './Query';
import Select from './Select';
import { qualify } from '../utility';

export function stringify(query: Query | Select<any>){
  let lines = "";

  if(query instanceof Select)
    lines += generateSelect(query);

  lines += generateTables(query);
  lines += generateWhere(query);

  return lines.replace(/\t/g, "  ");
}

function generateSelect(query: Select<any>){
  if(!query.selects.size)
    return;

  const selection = [] as string[];

  query.selects.forEach((alias, field) => {
    let select = "\t" + field.qualifiedName;

    if(alias)
      select += " AS " + qualify(alias);

    selection.push(select);
  })

  return "SELECT" + "\n" + selection.join(",\n");
}

function generateWhere(query: Query){
  if(!query.wheres.length)
    return ""
  
  const where = query.wheres
    .map(x => "\n\t" + x)
    .join(" AND");

  return "\n" + "WHERE" + where;
}

function generateTables(query: Query){
  const [ from, ...joins ] = query.tables.values();
  const lines = [] as string[];

  if(from.join)
    throw new Error(`Table ${from.name} is joined but main table must be declared first.`);

  let fromStatement = `FROM ${qualify(from.name)}`;

  if(from.alias)
    fromStatement += ` AS ${qualify(from.alias)}`;

  lines.push(fromStatement);

  for(const table of joins){
    const { name, alias, join, on } = table;

    const type = join!.toUpperCase();
    let statement = `${type} JOIN ${qualify(name)}`;

    if(alias)
      statement += ` AS ${qualify(alias)}`;

    statement += `\n\tON ${on!.join("\n\tAND ")}`;

    lines.push(statement);
  }

  return "\n" + lines.join("\n");
}