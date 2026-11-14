import { Field } from '@expressive/orm';
import { Builder, DataTable, Parameter } from '@expressive/orm/driver';
import { Generator } from '@expressive/sql';

export function now(field?: Field){
  switch (field?.type) {
    case "date":
      return "UTC_DATE()";
    case "time":
      return "UTC_TIME()";
    default:
      return "UTC_TIMESTAMP(3)";
  }
}

export function escape(value: unknown){
  return typeof value == "string"
    ? `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`
    : value;
}

export class MySQLGenerator extends Generator {
  placed: Parameter[] = [];

  protected now(field?: Field){
    return now(field);
  }

  protected literal(value: unknown){
    return String(escape(value));
  }

  protected param(from: Parameter){
    this.placed.push(from);
    return "?";
  }

  protected jsonTable(table: DataTable){
    const param = this.param(table);
    const columns = Array.from(table.used, (field, i) => {
      const type = /char|text/i.test(field.datatype) && !/collate/i.test(field.datatype)
        ? `${field.datatype} CHARACTER SET utf8mb4`
        : field.datatype;

      return `${this.escape(field.column)} ${type} PATH '$[${i}]'`;
    });

    return `SELECT * FROM JSON_TABLE(${param}, '$[*]' COLUMNS (${columns.join(', ')})) AS \`rows\``;
  }

  protected insert(){
    const { inserts, tables } = this.query;

    if (!inserts.size)
      return false;

    if (tables.size > 1)
      return super.insert();

    const [[table, data]] = inserts;
    const keys: string[] = [];
    const values: string[] = [];

    for (const [field, value] of data) {
      keys.push(this.escape(field.column));
      values.push(this.value(value, field));
    }

    return [this.into(table), `(${keys.join(', ')}) VALUES (${values.join(', ')})`];
  }

  protected insertWith(cte: string | undefined, [, keys]: unknown[], select: unknown[]){
    const [[table]] = this.query.inserts;

    return [this.into(table), keys, cte, select];
  }

  private into(table: Builder.ITable){
    const { conflict } = this.query;

    return [conflict && !conflict.update ? 'INSERT IGNORE INTO' : 'INSERT INTO', this.escape(table.name)];
  }

  protected upsert(){
    const { conflict, inserts } = this.query;

    if (!conflict || !conflict.update)
      return;

    const [[table]] = inserts;
    const id = table.fields.get("id");
    const column = (field: Field) => this.escape(field.column);
    const set = conflict.update.map(field => `${column(field)} = VALUES(${column(field)})`);

    for (const [field, value] of conflict.set)
      set.push(`${column(field)} = ${this.value(value, field)}`);

    if (id && id.increment && !id.parts)
      set.unshift(`${column(id)} = LAST_INSERT_ID(${column(id)})`);
    else if (!set.length)
      set.push(...conflict.on.map(field => `${column(field)} = ${column(field)}`));

    return ['ON DUPLICATE KEY UPDATE', set.join(', ')];
  }

  protected returning(){
    return undefined;
  }

  protected set(updates: Map<Builder.ITable, Builder.Insert>){
    const qualify = this.query.tables.size > 1;
    const sets: string[] = [];

    for (const [table, data] of updates)
      for (const [field, value] of data) {
        const column = qualify
          ? this.escape(table.alias || table.name) + "." + this.escape(field.column)
          : this.escape(field.column);

        sets.push(`${column} = ${value === null ? 'NULL' : this.value(value, field)}`);
      }

    if (!sets.length)
      throw new Error('Update contains no values.');

    return `SET ${sets.join(', ')}`;
  }

  protected update(){
    const { updates, tables } = this.query;

    if (!updates.size)
      return;

    const [main] = tables.values();

    return [
      'UPDATE',
      this.table(main),
      this.joins(main),
      this.set(updates)
    ];
  }

  protected delete(){
    const { query } = this;
    const [main] = query.deletes;

    if (!main)
      return;

    if (query.tables.size == 1)
      return ['DELETE FROM', this.escape(main.name)];

    const [first] = query.tables.values();
    const targets = Array.from(query.deletes, ({ alias, name }) => this.escape(alias || name));

    return ['DELETE', targets.join(', '), 'FROM', this.table(first), this.joins(first)];
  }

  reselect(){
    const { inserts, returns } = this.query;
    const [[table]] = inserts;

    return 'SELECT ' + Array.from(returns as Map<string, Field>, ([alias, field]) => (
      `${this.value(field)} AS \`${alias}\``
    )).join(', ') + ` FROM ${this.escape(table.name)}`;
  }

  escape(name: unknown){
    return String(name).split('.').map(x => `\`${x.replace(/`/g, "``")}\``).join('.');
  }
}
