import { Builder, DataTable, Value } from '../query/Builder';
import { Query } from '../query/Query';
import { Field } from '../type/Field';

export class Generator {
  cte = new Map<string, string>();

  constructor(public query: Builder){}

  toString() {
    const parts = [
      this.toWith(),
      this.toDoes(),
      this.toWhere(),
      this.toOrder(),
      this.toLimit()
    ];

    return parts.flat().filter(Boolean).join(' ');
  }

  toDoes(){
    return this.toUpdate() || this.toDelete() || this.toSelect();
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

      cte.push(`${this.escape(table)} AS (SELECT ${fields} FROM json_each(?))`)
    })

    if(cte.length)
      return 'WITH ' + cte.join();
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
      return output.join(' ');
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
          value = this.escape(value);
        else
          value = field.raw(value);

        sets.push(`${this.escape(field.column)} = ${value}`);
      }

    if(!sets.length)
      throw new Error('Update contains no values.');

    return `SET ${sets}`;
  }

  protected toUpdate(multiTableAllowed = false){
    const { updates } = this.query;

    if(!updates.size)
      return;

    if(updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    const [ main ] = updates.keys();

    return [
      'UPDATE',
      this.escape(main),
      this.toJoins(main),
      this.toSet(updates)
    ]
  }

  protected toDelete(){
    const { query } = this;
    const [ main ] = this.query.deletes;

    if(!main)
      return;

    const { alias, name } = main;

    return [
      "DELETE",
      query.tables.size > 1 && (alias || name),
      'FROM', name, this.toJoins(main)
    ]
  }

  protected toSelect(){
    const { selects, tables } = this.query;
    const [ main ] = tables.values();

    const selection =
      selects instanceof Field ? selects.toString() :
      selects instanceof Map ?
        // TODO: simplify this
        Array.from(selects)
        .map(([alias, field]) => `${field} AS "${alias}"`)
        .join(', ') :
      selects ? `${selects} AS value` :
      'COUNT(*)';

    return [
      "SELECT",
      selection,
      main && `FROM ${main}`,
      this.toJoins(main)
    ]
  }

  protected toWhere(){
    const { filters } = this.query;

    if(filters.size)
      return ['WHERE', filters];
  }

  protected toOrder(){
    const { order } = this.query;

    if(order.size)
      return 'ORDER BY ' + Array.from(order).map(x => x.join(' '))
  }

  protected toLimit(){
    const { limit } = this.query;

    if(limit)
      return ['LIMIT', limit];
  }
}