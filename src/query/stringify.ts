import Query from './Query';
import Select from './Select';
import { qualify } from '../utility';

export function stringify(query: Query | Select<any>){
  let lines = "";

  if(query instanceof Select)
    lines += generateSelect(query);

  lines += generateTables(query);
  lines += generateWhere(query);

  return lines;
}

function generateSelect(query: Select<any>){
  if(!query.selects.size)
    return;

  const selection = [] as string[];

  query.selects.forEach((alias, field) => {
    let select = field.qualifiedName;

    if(alias)
      select += " AS " + qualify(alias);

    selection.push(select);
  })

  return "SELECT" + selection.join(",");
}

function generateTables(query: Query){
  const [ from, ...joins ] = query.tables;
  const lines = [] as string[];

  let fromStatement = `FROM ${qualify(from.name)}`;

  if(from.alias)
    fromStatement += ` AS ${qualify(from.alias)}`;

  lines.push(fromStatement);

  for(const table of joins){
    const { name, alias, join, on: filter } = table;

    const type = join!.toUpperCase();
    let statement = `${type} JOIN ${qualify(name)}`;

    if(alias)
      statement += ` AS ${qualify(alias)}`;

    if(filter) 
      statement += ` ON ` + filter.join(" AND ");

    lines.push(statement);
  }

  return " " + lines.join(" ");
}

function generateWhere(query: Query){
  if(!query.wheres.length)
    return ""
  
  const where = query.wheres.join(" AND ");

  return " WHERE " + where;
}