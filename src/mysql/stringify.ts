import Query from '../Query';
import { qualify } from '../utility';

function map<T, R>(
  iterable: Map<any, T> | Set<T> | T[],
  mapFn: (value: T) => R){

  const output = [] as R[];

  iterable.forEach(value => {
    output.push(mapFn(value));
  })

  return output;
}

export function stringify(query: Query){
  const { selects, tables, where } = query;
  const lines = [] as string[];

  if(selects.size)
    lines.push(
      "SELECT",
      map(selects, clause => `\t${clause}`).join(",\n")
    )

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

  if(where.size)
    lines.push(
      "WHERE\n\t" + [...where].join(" AND\n\t")
    );

  return lines.join("\n").replace(/\t/g, "  ");
}