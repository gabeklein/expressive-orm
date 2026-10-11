import { Builder, Computed, DataField, DataTable, Field, Parameter, QueryTemplate } from '@expressive/orm';

import { escape } from '../utils';

type Expression = Builder["filters"];

function isValue(input: unknown){
  return (
    input instanceof Field ||
    input instanceof Parameter ||
    input instanceof DataField ||
    input instanceof QueryTemplate ||
    input instanceof Computed
  );
}

export class Generator {
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
      this.limit(),
      this.returning()
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

  protected returning(){
    const { inserts, returns } = this.query;

    if (!inserts.size || !returns)
      return;

    return 'RETURNING ' + (
      returns instanceof Map
        ? Array.from(returns, ([alias, field]) => `${this.value(field)} AS "${alias}"`).join(', ')
        : this.reference(returns)
    );
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
    if(isValue(input))
      return this.reference(input);

    if(typeof input === "string")
      return `'${input.replace(/'/g, "\\'")}'`;

    return String(input);
  }

  protected jsonTable(_table: DataTable): string {
    throw new Error("Not implemented.");
  }

  protected computed(from: Computed<unknown>): string {
    const { left, operator, right, rank } = from;
    const side = (input: unknown, tight: boolean) => {
      if(!(input instanceof Computed))
        return this.value(input);

      const value = this.computed(input);

      return (tight ? input.rank <= rank : input.rank < rank) ? `(${value})` : value;
    }

    if(left === undefined)
      return operator + side(right, true);

    return `${side(left, false)} ${operator} ${side(right, true)}`;
  }

  protected joins(main: Builder.ITable){
    const output: string[] = [];

    for(const table of this.query.tables.values()){
      if(table === main)
        continue;

      const { alias, name, optional } = table;

      if(table.joins.length === 0)
        throw new Error(`Table ${name} has no joins.`);

      const mode = optional ? "LEFT" : "INNER";
      const as = this.escape(name) + (alias ? ` ${this.escape(alias)}` : "");
      const conds = table.joins.map(x => this.filter(x.left, x.op, x.right));

      output.push(`${mode} JOIN ${as} ON ${conds.join(' AND ')}`);
    }

    if(output.length)
      return output.join(' ');
  }

  protected set(updates: Map<Builder.ITable, Builder.Insert>){
    const sets: string[] = [];

    for(const [_table, data] of updates)
      for(const [field, value] of data)
        sets.push(`${this.escape(field.column)} = ${
          isValue(value) ? this.reference(value) :
          value === null ? 'NULL' :
          escape(value)
        }`);

    if(!sets.length)
      throw new Error('Update contains no values.');

    return `SET ${sets}`;
  }

  protected update(){
    const { updates } = this.query;

    if(!updates.size)
      return;

    if(updates.size > 1)
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
    const [ main ] = query.deletes;

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
      return from.from;

    if(from instanceof Computed)
      return this.computed(from);

    if(from instanceof Parameter)
      return this.param(from);

    const { table, column } = from as Field;

    return this.escape(table!.alias || table!.name) + "." + this.escape(column);
  }

  protected select(){
    const { returns, tables } = this.query;
    const [ main ] = tables.values();

    const selection =
      returns instanceof Map ?
        Array.from(returns, ([alias, field]) => this.value(field) + ` AS "${alias}"`).join(', ') :
      returns ?
        this.reference(returns) :
        'COUNT(*)';

    return [
      "SELECT",
      selection,
      this.from(),
      main && this.joins(main)
    ]
  }

  protected from(){
    const [ main ] = this.query.tables.values();

    if(main)
      return ["FROM", this.escape(main.name), main.alias]
  }

  protected param(_from: Parameter){
    return "?";
  }

  protected filter(left: Field, op: string, right: unknown){
    const raw = (value: unknown) => isValue(value) ? this.reference(value) : escape(left.set(value));

    if (right === null){
      if(op == '=')
        op = 'IS';
      else if(op == '<>' || op == '!=')
        op = 'IS NOT';
      else
        throw new Error('Cannot compare NULL with ' + op);

      right = 'NULL';
    }
    else if(right instanceof Array)
      right = `(${right.map(raw)})`;
    else
      right = raw(right);

    return `${this.reference(left)} ${op} ${right}`;
  }

  protected where() {
    const { filters } = this.query;

    if (!filters.size) return;

    const combine = (group: Expression, or?: boolean): string => {
      return Array
        .from(group.children, (cond, i) => {
          if ("children" in cond) {
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
    const { limit, offset } = this.query;

    return [
      limit && `LIMIT ${limit}`,
      offset && `OFFSET ${offset}`
    ];
  }
}
