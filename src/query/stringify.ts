import Query from './Query';
import Select from './Select';
import { qualify } from '../utility';

export function stringify(query: Query | Select<any>){
  const lines = [] as string[];

  if("selects" in query && query.selects.size){
    const selection = [] as string[];

    query.selects.forEach((alias, field) => {
      selection.push(`\t${field.qualifiedName} AS ${qualify(alias)}`)
    })

    lines.push( "SELECT", selection.join(",\n"));
  }

  lines.push(...generateTables(query));

  if(query.clauses.size)
    lines.push(
      "WHERE\n\t" + [...query.clauses].join(" AND\n\t")
    );

  return lines.join("\n").replace(/\t/g, "  ");
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

  return lines;
}