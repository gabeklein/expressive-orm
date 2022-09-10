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

  if(selects.size){
    lines.push(
      "SELECT",
      map(selects, clause => `\t${clause}`).join(",\n")
    )
  }

  const [ from, ...joins ] = tables.values();

  if(from.join)
    throw new Error(`Table ${from.name} is joined but main table must be declared first.`);

  lines.push(`FROM \`${from.name}\``);

  for(const table of joins){
    const type = table.join!.toUpperCase();
    let join = `${type} JOIN ${qualify(table.name)}`;

    if(table.alias)
      join += ` AS ${table.alias}`;

    const on = `\n\tON ${table.on!.join("\n\tAND ")}`;

    lines.push(join + on);
  }

  if(where.size)
    lines.push(
      "WHERE\n\t" + [...where].join(" AND\n\t")
    );

  return lines.join("\n");
}