import { Field } from "../type/Field";
import { Value, type Builder } from "./Builder";

export class Generator {
  constructor(public query: Builder){}

  toString() {
    const query = [] as unknown[];
    const add = query.push.bind(query);

    const { deletes, limit, order, tables, updates, filters, cte } = this.query;

    if(cte.size)
      add('WITH', Array.from(cte, ([name, param]) => {
        const fields = Array.from(param, ([key], i) => `value -> ${i} AS \`${key}\``)
        return `${name} AS (SELECT ${fields} FROM json_each(?))`;
      }));

    if(updates.size){
      const [ main ] = updates.keys();
      const joins = this.toJoins(main);

      add('UPDATE', main);

      if(joins)
        add(joins);

      add('SET', this.toUpdate());
    }
    else {
      const [ main ] = tables.values();

      if(deletes.size){
        const [ target ] = deletes;
        const { alias, name } = target!;
  
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

      const joins = this.toJoins(main);

      if(joins)
        add(joins);
    }

    if(filters.size)
      add('WHERE', filters);
  
    if(order.size)
      add('ORDER BY', Array.from(order).map(x => x.join(' ')));
  
    if(limit)
      add('LIMIT', limit);
  
    return query.join(' ');
  }

  toJoins(main: Builder.Table){
    const output: string[] = [];
    const applied = new Set();

    for(const table of this.query.tables.values()){
      if(table === main)
        continue;

      const { alias, name, optional } = table;

      if(table.joins.length === 0)
        throw new Error(`Table ${name} has no joins.`);

      const joins = table.joins.filter(x => {
        if(!applied.has(x)){
          applied.add(x);
          return true;
        }
      });

      const mode = optional ? "LEFT" : "INNER";
      const as = name + (alias ? ` ${alias}` : "");
      const conditions = joins.map(x => x.join(' '));
      
      output.push(
        `${mode} JOIN ${as} ON ${conditions.join(' AND ')}`
      );
    }

    return output.join(' ');
  }

  toSelect(){
    const { selects } = this.query;

    if (!selects)
      return 'COUNT(*)';

    if (selects instanceof Field)
      return selects.toString();

    if(selects instanceof Map)
      return Array.from(selects)
        .map(([alias, field]) => `${field} AS \`${alias}\``)
        .join(', ');

    return `${selects} AS value`;
  }

  toUpdate(multiTableAllowed = false){
    const { updates } = this.query;
    const sets: string[] = [];

    if(updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    for(const [table, data] of updates)
      for(let [col, value] of Object.entries(data)){
        const field = table.reference[col] as Field; 

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