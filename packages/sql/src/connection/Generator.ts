import { Builder, DataField, DataTable, Group, Parameter, QueryTemplate, Value } from '../query/Builder';
import { Computed } from '../query/Computed';
import { Query } from '../query/Query';
import { Field } from '../type/Field';
import { escape } from '../utils';

export class Generator {
  cte = new Map<string, string>();

  constructor(public query: Builder){}

  toString() {
    const parts = [
      this.with(),
      this.insert() ||
      this.update() ||
      this.delete() ||
      this.select(),
      this.where(),
      this.order(),
      this.limit()
    ];

    return parts.flat(Infinity).filter(Boolean).join(' ');
  }

  escape(name: unknown){
    return String(name).split('.').map(x => `\`${x}\``).join('.');
  }

  protected insert() {
    const { inserts, tables } = this.query;

    if (!inserts.size)
      return false;

    const [[table, data]] = inserts;

    const keys: string[] = [];
    const values: string[] = [];

    for (const [field, value] of data) {
      keys.push(this.escape(field.column));
      values.push(this.value(value));
    }

    return [
      'INSERT INTO',
      this.escape(table.name),
      `(${keys}) SELECT ${values}`,
      tables.size > 1 && this.from()
    ];
  }

  protected with(){
    const cte = [] as string[];

    this.query.tables.forEach((table) => {
      if (table instanceof DataTable)
        cte.push(`${this.escape(table.name)} AS (${this.jsonTable(table)})`);
    });

    if(cte.length)
      return 'WITH ' + cte.join();
  }

  protected value(input: unknown){
    if(input instanceof Value || input instanceof Field)
      return this.reference(input as any) as string;

    if(typeof input === "string")
      return `'${input.replace(/'/g, "\\'")}'`;

    return String(input);
  }

  protected jsonTable(table: DataTable){
    throw new Error("Not implemented.")
  }

  computed(from: Computed<any>){
    let { left, operator, right } = from;

    if(right instanceof Computed){
      const value = this.computed(right);
      right = right.rank <= from.rank ? `(${value})` : value;
    }

    if(!left)
      return `${operator}${right}`;

    if(left instanceof Computed){
      const value = this.computed(left);
      left = left.rank < from.rank ? `(${value})` : value;
    }

    return `${left} ${operator} ${right}`;
  }

  protected joins(main: Builder.ITable){
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
      const as = this.escape(name) + (alias ? ` ${this.escape(alias)}` : "");
      const conds = joins.map(x => this.filter(x.left, x.op, x.right));

      output.push(`${mode} JOIN ${as} ON ${conds.join(' AND ')}`);
    }

    if(output.length)
      return output.join(' ');
  }

  protected set(updates: Map<Query.ITable, Builder.Insert>){
    const sets: string[] = [];

    for(const [_table, data] of updates)
      for(let [field, value] of data){
        if(value === undefined)
          continue;

        if(value instanceof Field || value instanceof Value){
          value = this.reference(value);
        }
        else if(value === null){
          if(field.nullable)
            value = 'NULL';
          else
            throw new Error(`Column ${field} is not nullable.`);
        }
        else
          value = escape(field.set(value));

        sets.push(`${this.escape(field.column)} = ${value}`);
      }

    if(!sets.length)
      throw new Error('Update contains no values.');

    return `SET ${sets}`;
  }

  protected update(multiTableAllowed = false){
    const { updates } = this.query;

    if(!updates.size)
      return;

    if(updates.size > 1 && !multiTableAllowed)
      throw new Error('Engine does not support multi-table updates.');

    const [ main ] = updates.keys();

    return [
      'UPDATE',
      this.escape(main),
      this.joins(main),
      this.set(updates)
    ]
  }

  protected delete(){
    const { query } = this;
    const [ main ] = this.query.deletes;

    if(!main)
      return;

    const { alias, name } = main;
    const target = query.tables.size > 1 && (alias || name);

    return ['DELETE', target, 'FROM', this.escape(name), this.joins(main)]
  }

  protected reference(from: unknown): string {
    if(from instanceof DataField)
      return this.escape(from.table.name + '.' + from.column);

    if(from instanceof QueryTemplate)
      return from.parts.map((x) => String(this.reference(x))).join('');

    if(from instanceof Computed)
      return this.computed(from);

    if(from instanceof Parameter)
      return this.param(from);

    if(from instanceof Field){
      const column = this.escape(from.column);
      const { table } = from;
  
      if(table)
        return this.escape(table.alias || table.name) + "." + column;
    }

    return String(from);
  }

  protected select(){
    const { returns, tables } = this.query;
    const [ main ] = tables.values();

    const selection =
      returns instanceof Map ?
        // TODO: simplify this
        Array.from(returns)
          .filter(([_alias, field]) => {
            return field instanceof Field ? !field.absent : true;
          })
          .map(([alias, field]) => this.value(field) + ` AS "${alias}"`)
          .join(', ') :
      returns ?
        this.reference(returns as Field) :
        'COUNT(*)';

    return [
      "SELECT",
      selection,
      this.from(),
      this.joins(main)
    ]
  }

  protected from(){
    const [ main ] = this.query.tables.values();
    
    if(main)
      return ["FROM", this.escape(main.name), main.alias]
  }

  protected param(from: Parameter){
    return "?";
  }

  protected filter(left: Field, op: string, right: unknown){
    const raw = (value: unknown) => escape(left.set(value));
    
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
      right = `(${right.map(raw)})`;
    else if (right instanceof Field || right instanceof Value)
      right = this.reference(right);
    else
      right = raw(right);

    return `${this.reference(left)} ${op} ${right}`;
  }

  protected where() {
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
          
          return this.filter(cond.left, cond.op, cond.right);
        })
        .join(or ? ' OR ' : ' AND ');
    };

    return ['WHERE', combine(filters)];
  }

  protected order(){
    const { order } = this.query;

    if(order.size)
      return 'ORDER BY ' +
        Array.from(order, ([x, y]) => `${this.reference(x)} ${y}`);
  }

  protected limit(){
    const { limit } = this.query;

    if(limit)
      return ['LIMIT', limit];
  }
}