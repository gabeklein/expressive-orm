import { Field } from "../type/Field";
import { Value, type Builder } from "./Builder";

export class Generator {
  constructor(public query: Builder){}

  toString() {
    const query = [] as unknown[];
    const add = query.push.bind(query);

    const { deletes, limit, order, tables, updates, filters, cte } = this.query;
    const [ main, ...joins ] = tables.values();

    if(cte.size)
      add('WITH', Array.from(cte, ([name, param]) => {
        const fields = Array.from(param, ([key], i) => `value -> ${i} AS ${key}`)
        return `${name} AS (SELECT ${fields} FROM json_each(?))`;
      }));

    if(updates.size){
      add("UPDATE", main);
    }
    else if(deletes.size){
      const [ target ] = deletes;
      const { alias, name } = tables.get(target)!;

      add("DELETE");

      if(tables.size > 1 || alias)
        add(alias || name);

      add('FROM', name);
    }
    else {
      add('SELECT', this.toSelect());
      
      if(main)
        add('FROM', main);
    }

    for(const table of joins){
      const { as, on } = table.join!;
      add(as.toUpperCase(), "JOIN", table, 'ON', on);
    }

    if(updates.size)
      add('SET', this.toUpdate());

    if(filters.size)
      add('WHERE', filters);
  
    if(order.size)
      add('ORDER BY', Array.from(order).map(x => x.join(' ')));
  
    if(limit)
      add('LIMIT', limit);
  
    return query.join(' ');
  }

  toSelect(){
    const { selects } = this.query;

    if (!selects)
      return 'COUNT(*)';

    if(selects instanceof Map)
      return Array.from(selects)
        .map(([alias, field]) => `${field} AS \`${alias}\``)
        .join(', ');

    if (selects instanceof Field)
      return selects.toString();

    return `${selects} AS value`;
  }

  toUpdate(multiTableAllowed = false){
    const { updates } = this.query;
    const sets: string[] = [];

    if(updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    for(const [table, data] of updates)
      for(let [col, value] of Object.entries(data)){
        const field = table[col] as Field; 

        if(value === undefined)
          continue;

        if(value === null){
          if(field.nullable)
            value = 'NULL';
          else
            throw new Error(`Column ${field} is not nullable.`);
        }
        else if(value instanceof Field || value instanceof Value)
          value = value.toString();
        else
          value = field.raw(value);

        sets.push(`\`${field.column}\` = ${value}`);
      }

    if(sets.length)
      return sets.join(', ');

    throw new Error('Update contains no values.');
  }

}