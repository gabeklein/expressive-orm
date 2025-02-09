import { Builder, DataField, DataTable, Group, Parameter, Value } from '../query/Builder';
import { Computed } from '../query/Computed';
import { Query } from '../query/Query';
import { Field } from '../type/Field';

export class Generator {
  cte = new Map<string, string>();

  constructor(public query: Builder){}

  toString() {
    const parts = [
      this.toWith(),
      this.toInsert() ||
      this.toUpdate() ||
      this.toDelete() ||
      this.toSelect(),
      this.toWhere(),
      this.toOrder(),
      this.toLimit()
    ];

    return parts.flat(Infinity).filter(Boolean).join(' ');
  }

  escape(name: unknown){
    return String(name).split('.').map(x => `\`${x}\``).join('.');
  }

  protected toInsert(): false | unknown[] {
    const { inserts } = this.query;

    if (inserts)
      throw new Error("Insert not implemented, do you have an adapter?");

    return false;
  }

  protected toWith(){
    const cte = [] as string[];

    this.query.tables.forEach((table) => {
      if (table instanceof DataTable)
        cte.push(`${this.escape(table.name)} AS (${this.toJsonTable(table)})`);
    });

    if(cte.length)
      return 'WITH ' + cte.join();
  }

  protected toJsonTable(table: DataTable){
    throw new Error("Not implemented.")
  }

  toComputed(from: Computed<any>){
    let { left, operator, right } = from;

    if(right instanceof Computed){
      const value = this.toComputed(right);
      right = right.rank <= from.rank ? `(${value})` : value;
    }

    if(!left)
      return `${operator}${right}`;

    if(left instanceof Computed){
      const value = this.toComputed(left);
      left = left.rank < from.rank ? `(${value})` : value;
    }

    return `${left} ${operator} ${right}`;
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
      const conds = joins.map(x => this.toFilter(x.left, x.op, x.right));

      output.push(`${mode} JOIN ${as} ON ${conds.join(' AND ')}`);
    }

    if(output.length)
      return output.join(' ');
  }

  protected toSet(updates: Map<Query.Table, Builder.Insert>){
    const sets: string[] = [];

    for(const [_table, data] of updates)
      for(let [field, value] of data){
        if(value === undefined)
          continue;

        if(value instanceof Field || value instanceof Value){
          value = this.toReference(value);
        }
        else if(value === null){
          if(field.nullable)
            value = 'NULL';
          else
            throw new Error(`Column ${field} is not nullable.`);
        }
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
    const target = query.tables.size > 1 && (alias || name);

    return ['DELETE', target, 'FROM', this.escape(name), this.toJoins(main)]
  }

  protected toReference(from: Field | Value | Parameter | string | number){
    if(typeof from === "string")
      return `'${from.replace(/'/g, "\\'")}'`;

    if(from instanceof DataField)
      return this.escape(from.table.name + '.' + from.column);

    if(from instanceof Computed)
      return this.toComputed(from);

    if(from instanceof Parameter)
      return this.toParam(from);

    if(from instanceof Value)
      return from.toString();

    if(from instanceof Field){
      const column = this.escape(from.column);
      const { table } = from;
  
      if(table)
        return this.escape(table.alias || table.name) + "." + column;
    }

    return from;
  }

  protected toSelect(){
    const { returns, tables } = this.query;
    const [ main ] = tables.values();

    const selection =
      returns instanceof Map ?
        // TODO: simplify this
        Array.from(returns)
          .map(([alias, field]) => this.toReference(field) + ` AS "${alias}"`)
          .join(', ') :
      returns ?
        this.toReference(returns as Field) :
        'COUNT(*)';

    return [
      "SELECT",
      selection,
      this.toFrom(),
      this.toJoins(main)
    ]
  }

  protected toFrom(){
    const [ main ] = this.query.tables.values();
    
    if(main)
      return ["FROM", this.escape(main.name), main.alias]
  }

  protected toParam(from: Parameter){
    return "?";
  }

  protected toFilter(left: Field, op: string, right: unknown){
    if (right === null){
      right === "NULL";

      if(op == '=')
        op = 'IS';
      else if(op == '!=')
        op = 'IS NOT';
      else
        throw new Error('Cannot compare NULL with ' + op);
    }
    else if(right instanceof Array)
      right = `(${right.map(left.raw, left)})`;
    else if (right instanceof Field || right instanceof Value)
      right = this.toReference(right);
    else
      right = left.raw(right);

    return `${this.toReference(left)} ${op} ${right}`;
  }

  protected toWhere() {
    const { filters } = this.query;

    if (!filters.size) return;

    const combine = (group: Group, or?: boolean): string => {
      return Array
        .from(group.children, (cond, i) => {
          if (cond instanceof Group) {
            const inner = combine(cond, !or);
            const first = or !== false && i === 0;
            return cond.size === 1 || first ? inner : `(${inner})`;
          }
          
          return this.toFilter(cond.left, cond.op, cond.right);
        })
        .join(or ? ' OR ' : ' AND ');
    };

    return ['WHERE', combine(filters)];
  }

  protected toOrder(){
    const { order } = this.query;

    if(order.size)
      return 'ORDER BY ' +
        Array.from(order, ([x, y]) => `${this.toReference(x)} ${y}`);
  }

  protected toLimit(){
    const { limit } = this.query;

    if(limit)
      return ['LIMIT', limit];
  }
}