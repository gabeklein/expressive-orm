import { Field } from '../type/Field';
import { Builder, DataTable, Value } from './Builder';
import { Query } from './Query';

export class Generator {
  acc = [] as unknown[];
  add = (...args: unknown[]) => this.acc.push(...args);

  constructor(public query: Builder){
    this.toWith();

    this.toUpdate() ||
    this.toDelete() ||
    this.toSelect()

    this.toWhere();
    this.toOrder();
    this.toLimit();
  }

  toString() {
    return this.acc.join(' ');
  }

  escape(name: unknown){
    return String(name).split('.').map(x => `\`${x}\``).join('.');
  }

  protected toWith(){
    const cte = [] as string[];

    // TODO: move this to adapter
    this.query.tables.forEach((table) => {
      if(!(table instanceof DataTable))
        return;

      const fields = Array.from(table.used, ([key], i) => `value ->> ${i} ${this.escape(key)}`);

      cte.push(`${table} AS (SELECT ${fields} FROM json_each(?))`)
    })

    if(cte.length)
      this.add('WITH', cte.join(", "));
  }

  protected toJoins(main: Builder.Table){
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
      const conditions = joins.map(([left, op, right]) =>
        `${this.escape(left)} ${op} ${this.escape(right)}`
      );

      output.push(`${mode} JOIN ${as} ON ${conditions.join(' AND ')}`);
    }

    if(output.length)
      this.add(output.join(' '));
  }

  protected toSet(updates: Map<Query.Table, Query.Update<any>>){
    const sets: string[] = [];

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

        sets.push(`${this.escape(field.column)} = ${value}`);
      }

    if(!sets.length)
      throw new Error('Update contains no values.');

    this.add('SET', sets.join(', '));
  }

  protected toUpdate(multiTableAllowed = false){
    const { updates } = this.query;

    if(!updates.size)
      return;

    if(updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    const [ main ] = updates.keys();

    this.add('UPDATE', this.escape(main));
    this.toJoins(main);
    this.toSet(updates);

    return true;
  }

  protected toDelete(){
    const { add, query } = this;
    const [ main ] = this.query.deletes;

    if(!main)
      return;

    const { alias, name } = main;

    add("DELETE");

    if(query.tables.size > 1 || alias)
      add(alias || name);

    add('FROM', name);

    this.toJoins(main);

    return true;
  }

  protected toSelect(){
    const { add } = this;
    const { selects } = this.query;

    add("SELECT")

    if (!selects)
      add('COUNT(*)');

    else if (selects instanceof Field)
      add(selects.toString());

    else if(selects instanceof Map)
      add(
        Array.from(selects)
        .map(([alias, field]) => `${field} AS \`${alias}\``)
        .join(', ')
      )
    else 
      add(`${selects} AS value`);

    const [ main ] = this.query.tables.values();
        
    if(main)
      add('FROM', main);

    this.toJoins(main);
  }

  protected toWhere(){
    const { filters } = this.query;

    if(filters.size)
      this.add('WHERE', filters);
  }

  protected toOrder(){
    const { order } = this.query;

    if(order.size)
      this.add('ORDER BY', Array.from(order).map(x => x.join(' ')));
  }

  protected toLimit(){
    const { limit } = this.query;

    if(limit)
      this.add('LIMIT', limit);
  }
}