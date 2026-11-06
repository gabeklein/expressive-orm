import { Builder, Computed, DataField, DataTable, Field, now as NOW, Parameter, QueryTemplate } from '@expressive/orm';
import { Generator } from '@expressive/sql';

export function now(field?: Field){
  switch (field?.type) {
    case "ms":
      return "CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS SIGNED)";
    case "seconds":
    case "integer":
      return "UNIX_TIMESTAMP()";
    case "date":
      return "UTC_DATE()";
    case "time":
      return "UTC_TIME()";
    case "text":
      return "DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')";
    default:
      return "UTC_TIMESTAMP(3)";
  }
}

export function escape(value: unknown){
  return typeof value == "string"
    ? `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`
    : value;
}

function isValue(input: unknown){
  return (
    input instanceof Field ||
    input instanceof Parameter ||
    input instanceof DataField ||
    input instanceof QueryTemplate ||
    input instanceof Computed
  );
}

export class MySQLGenerator extends Generator {
  placed: Parameter[] = [];

  protected now(field?: Field){
    return now(field);
  }

  protected value(input: unknown, field?: Field){
    if (input !== NOW && !isValue(input))
      return String(escape(input));

    return super.value(input, field);
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

  protected with(){
    if (!this.query.inserts.size)
      return super.with();
  }

  protected insert(){
    const { inserts, tables } = this.query;

    if (!inserts.size)
      return false;

    const [[table, data]] = inserts;
    const cte = tables.size > 1 && super.with();
    const keys: string[] = [];
    const values: string[] = [];

    for (const [field, value] of data) {
      keys.push(this.escape(field.column));
      values.push(this.value(value, field));
    }

    const into = [
      this.query.conflict && !this.query.conflict.update ? 'INSERT IGNORE INTO' : 'INSERT INTO',
      this.escape(table.name)
    ];

    if (tables.size <= 1)
      return [...into, `(${keys.join(', ')}) VALUES (${values.join(', ')})`];

    if (!keys.length)
      throw new Error(`Insert into ${table.name} for each joined row needs at least one value.`);

    return [...into, `(${keys.join(', ')})`, cte, `SELECT ${values.join(', ')}`, this.from()];
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

  protected from(){
    const [main] = this.query.tables.values();

    if (main)
      return ['FROM', this.table(main)];
  }

  protected filter(left: Field, op: string, right: unknown){
    const raw = (value: unknown) => (
      value === NOW ? this.now(left) :
      isValue(value) ? this.reference(value) :
      escape(op.includes("LIKE") ? value : left.set(value))
    );

    if (right === null){
      if (op == '=')
        op = 'IS';
      else if (op == '<>' || op == '!=')
        op = 'IS NOT';
      else
        throw new Error('Cannot compare NULL with ' + op);

      right = 'NULL';
    }
    else if (right instanceof Array){
      if (!right.length)
        return op == 'NOT IN' ? '1 = 1' : '1 = 0';

      right = `(${right.map(raw).join(', ')})`;
    }
    else
      right = raw(right);

    return `${this.reference(left)} ${op} ${right}`;
  }

  protected table({ name, alias }: Builder.ITable){
    return this.escape(name) + (alias ? ` ${this.escape(alias)}` : "");
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
