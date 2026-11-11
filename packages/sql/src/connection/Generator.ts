import { Field, now } from '@expressive/orm';
import { Builder, Computed, DataField, DataTable, Parameter, QueryTemplate } from '@expressive/orm/driver';

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

/**
 * Renders a `Query` builder as one SQL statement - `String(generator)`.
 *
 * A dialect subclasses it and overrides the protected hooks. Literals render inline, escaped; parameters bind.
 */
export class Generator {
  constructor(public query: Builder){}

  toString() {
    const parts = [
      this.insert() || [
        this.with(),
        this.update() ||
        this.delete() ||
        this.select()
      ],
      this.where(),
      this.order(),
      this.limit(),
      this.upsert(),
      this.returning()
    ];

    return parts.flat(Infinity).filter(Boolean).join(' ');
  }

  /** Quote an identifier, each dotted part on its own. */
  escape(name: unknown){
    return String(name).split('.').map(x => `\`${x}\``).join('.');
  }

  /** `INSERT INTO`, or `false` when the query inserts nothing. */
  protected insert() {
    const { inserts, tables } = this.query;

    if (!inserts.size)
      return false;

    const [[table, data]] = inserts;

    const keys: string[] = [];
    const values: string[] = [];

    for (const [field, value] of data) {
      keys.push(this.escape(field.column));
      values.push(this.value(value, field));
    }

    if (!keys.length && tables.size > 1)
      throw new Error(`Insert into ${table.name} for each joined row needs at least one value.`);

    const into = ['INSERT INTO', this.escape(table.name)];

    if (!keys.length)
      return [this.with(), into, 'DEFAULT VALUES'];

    return this.insertWith(this.with(), [into, `(${keys})`], [
      `SELECT ${values}`,
      tables.size > 1 && this.from()
    ]);
  }

  /** Order an insert's data CTE, target and select - for a dialect placing `WITH` elsewhere. */
  protected insertWith(cte: string | undefined, into: unknown[], select: unknown[]): unknown[] {
    return [cte, into, select];
  }

  /** `ON CONFLICT` clause of an upsert. */
  protected upsert(){
    const { conflict } = this.query;

    if (!conflict)
      return;

    const on = `ON CONFLICT (${conflict.on.map(field => this.escape(field.column))})`;

    if (!conflict.update)
      return [on, 'DO NOTHING'];

    const set = conflict.update.map(({ column }) => `${this.escape(column)} = excluded.${this.escape(column)}`);

    for (const [field, value] of conflict.set)
      set.push(`${this.escape(field.column)} = ${this.value(value)}`);

    if (!set.length)
      set.push(...conflict.on.map(({ column }) => `${this.escape(column)} = excluded.${this.escape(column)}`));

    return [on, 'DO UPDATE SET', set.join(', ')];
  }

  /** `RETURNING` clause of an insert that selects. */
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

  /** `WITH` clause over the query's data tables. */
  protected with(){
    const cte = [] as string[];

    this.query.tables.forEach((table) => {
      if (table instanceof DataTable)
        cte.push(`${this.escape(table.name)} AS (${this.jsonTable(table)})`);
    });

    if(cte.length)
      return 'WITH ' + cte.join();
  }

  /** A value - `now`, a reference, or a literal. */
  protected value(input: unknown, field?: Field){
    if(input === now)
      return this.now(field);

    if(isValue(input))
      return this.reference(input);

    return this.literal(input);
  }

  /** A literal - every literal in values, `SET` and `WHERE` passes through it. */
  protected literal(value: unknown){
    return String(escape(value));
  }

  /** A table with its alias - for `FROM`, joins, `UPDATE` and `DELETE`. */
  protected table({ name, alias }: Builder.ITable){
    return this.escape(name) + (alias ? ` ${this.escape(alias)}` : "");
  }

  /** The current time - `CURRENT_TIMESTAMP`; a dialect renders it per `field`'s storage. */
  protected now(_field?: Field){
    return "CURRENT_TIMESTAMP";
  }

  /** Select a data table's rows out of its bound parameter. The base throws - a dialect implements it. */
  protected jsonTable(_table: DataTable): string {
    throw new Error("Not implemented.");
  }

  /** An arithmetic expression, parenthesized by operator rank. */
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

  /** `JOIN` clauses for every table but `main`. Throws for a table without a join condition. */
  protected joins(main: Builder.ITable){
    const output: string[] = [];

    for(const table of this.query.tables.values()){
      if(table === main)
        continue;

      const { name, optional } = table;

      if(table.joins.length === 0)
        throw new Error(`Table ${name} has no joins.`);

      const mode = optional ? "LEFT" : "INNER";
      const conds = table.joins.map(x => this.filter(x.left, x.op, x.right));

      output.push(`${mode} JOIN ${this.table(table)} ON ${conds.join(' AND ')}`);
    }

    if(output.length)
      return output.join(' ');
  }

  /** `SET` clause of an update. Throws without values. */
  protected set(updates: Map<Builder.ITable, Builder.Insert>){
    const sets: string[] = [];

    for(const [_table, data] of updates)
      for(const [field, value] of data)
        sets.push(`${this.escape(field.column)} = ${
          value === now ? this.now(field) :
          isValue(value) ? this.reference(value) :
          value === null ? 'NULL' :
          this.literal(value)
        }`);

    if(!sets.length)
      throw new Error('Update contains no values.');

    return `SET ${sets}`;
  }

  /** `UPDATE` head. Throws when the query updates more than one table. */
  protected update(){
    const { updates } = this.query;

    if(!updates.size)
      return;

    if(updates.size > 1)
      throw new Error('Engine does not support multi-table updates.');

    const [ main ] = updates.keys();

    return [
      'UPDATE',
      this.table(main),
      this.joins(main),
      this.set(updates)
    ]
  }

  /** `DELETE FROM` head. */
  protected delete(){
    const { query } = this;
    const [ main ] = query.deletes;

    if(!main)
      return;

    const { alias, name } = main;
    const target = query.tables.size > 1 && (alias || name);

    return ['DELETE', target, 'FROM', this.table(main), this.joins(main)]
  }

  /** A column, parameter, data column, raw template or expression. */
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

  /** `SELECT` head with joins - `COUNT(*)` when the query selects nothing. */
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

  /** `FROM` clause of the main table. */
  protected from(){
    const [ main ] = this.query.tables.values();

    if(main)
      return ["FROM", this.table(main)]
  }

  /** A parameter placeholder. */
  protected param(_from: Parameter){
    return "?";
  }

  /** One condition. `null` renders `IS` / `IS NOT`; an empty list a constant. */
  protected filter(left: Field, op: string, right: unknown){
    const raw = (value: unknown) => (
      value === now ? this.now(left) :
      isValue(value) ? this.reference(value) :
      this.literal(op.includes("LIKE") ? value : this.query.encode(left, value))
    );

    if (right === null){
      if(op == '=')
        op = 'IS';
      else if(op == '<>' || op == '!=')
        op = 'IS NOT';
      else
        throw new Error('Cannot compare NULL with ' + op);

      right = 'NULL';
    }
    else if(right instanceof Array){
      if(!right.length)
        return op == 'NOT IN' ? '1 = 1' : '1 = 0';

      right = `(${right.map(raw)})`;
    }
    else
      right = raw(right);

    return `${this.reference(left)} ${op} ${right}`;
  }

  /** `WHERE` clause - top level joined with AND, alternating with OR by depth. */
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

  /** `ORDER BY` clause. */
  protected order(){
    const { order } = this.query;

    if(order.size)
      return 'ORDER BY ' +
        Array.from(order, ([x, y]) => `${this.reference(x)} ${y}`);
  }

  /** `LIMIT` and `OFFSET` clauses. */
  protected limit(){
    const { limit, offset } = this.query;

    return [
      limit && `LIMIT ${limit}`,
      offset && `OFFSET ${offset}`
    ];
  }
}
