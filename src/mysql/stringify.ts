import Query from '../query/Query';
import { qualify } from '../utility';

export function stringify(query: Query){
  const { selects, tables, clauses } = query;
  const lines = [] as string[];

  if(selects.size){
    const selection = [] as string[];

    for(const [field, alias] of selects)
      selection.push(`\t${field.qualifiedName} AS ${qualify(alias)}`)

    lines.push( "SELECT", selection.join(",\n"));
  }

  const [ from, ...joins ] = tables.values();

  if(from.join)
    throw new Error(`Table ${from.name} is joined but main table must be declared first.`);

  let fromStatement = `FROM ${qualify(from.name)}`;

  if(from.alias)
    fromStatement += ` AS ${qualify(from.alias)}`;

  lines.push(fromStatement);

  for(const table of joins){
    const {
      name,
      alias,
      join,
      on
    } = table;

    const type = join!.toUpperCase();
    let statement = `${type} JOIN ${qualify(name)}`;

    if(alias)
      statement += ` AS ${qualify(alias)}`;

    statement += `\n\tON ${on!.join("\n\tAND ")}`;

    lines.push(statement);
  }

  if(clauses.size)
    lines.push(
      "WHERE\n\t" + [...clauses].join(" AND\n\t")
    );

  return lines.join("\n").replace(/\t/g, "  ");
}