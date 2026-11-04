import { Builder, Field, Query } from '@expressive/orm';
import { Connection } from '../connection/Connection';
import { format } from 'sql-formatter';

import { createEngine, Engine } from './engine';
import { SQLiteGenerator } from './SQLiteGenerator';

type TableInfo = { 
  name: string; 
  type: string; 
  notnull: number; 
  dflt_value: any
};

export class SQLiteConnection extends Connection {
  protected filename: string;
  protected engine?: Promise<Engine>;

  constructor(using: Connection.Types, filename?: string) {
    super(using);
    this.filename = filename || ':memory:';
  }

  protected db(){
    return this.engine ??= createEngine(this.filename);
  }

  get schema() {
    return pretty(this.generateSchema(this.using));
  }

  prepare(builder: Builder){
    const sql = String(new SQLiteGenerator(builder));
    const string = (x?: unknown[]) => x
      ? x.map(x => (
        x !== null && typeof x === 'object' ? JSON.stringify(x) :
        typeof x === 'boolean' ? Number(x) :
        x
      ))
      : [];

    const run = async <R>(op: (engine: Engine) => Promise<R>) => {
      await this.idle();

      try {
        return await op(await this.db());
      }
      catch (err) {
        if(err instanceof Error)
          throw new Error(`Error running SQL: ${err.message}\n${pretty(sql)}`);

        throw err;
      }
    };

    const counts = !builder.returns && !builder.inserts.size && !builder.updates.size && !builder.deletes.size;

    return {
      all: (p?: any[]) => run(e => e.all(sql, string(p))),
      run: counts
        ? (p?: any[]) => run(e => e.get(sql, string(p)).then(row => Number(Object.values(row)[0])))
        : (p?: any[]) => run(e => e.run(sql, string(p)).then(r => r.changes)),
      toString: () => pretty(sql)
    };
  }

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    const db = await this.db();

    await db.exec("BEGIN");

    try {
      const result = await fn();

      await db.exec("COMMIT");

      return result;
    }
    catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(){
    if (this.engine)
      await (await this.engine).close();

    await super.close();
  }

  async sync(fix = true){
    if (this.ready)
      throw new Error("Connection is already active.");

    for (const type of this.using)
      if (type.schema)
        throw new Error(`static schema is not supported by ${this.constructor.name}.`);

    const missing: Query.Table[] = [];
    const added: string[] = [];
    const issues: string[] = [];

    for (const type of this.using) {
      const absent = await this.valid(type);

      if (!absent)
        if (fix)
          missing.push(type);
        else
          throw new Error(`Table ${type.table} does not exist.`);
      else
        for (const field of absent) {
          const reason = unfit(field);

          if (!fix)
            issues.push(`Column ${field.column} does not exist in table ${type.table}`);
          else if (reason)
            issues.push(`Column ${field.column} in table ${type.table} ${reason}`);
          else
            added.push(`ALTER TABLE ${type.table} ADD COLUMN ${definition(field)};`);
        }
    }

    if (issues.length)
      throw new Error(issues.join("\n"));

    await this.createSchema(missing);

    if (added.length)
      await (await this.db()).exec(added.join("\n"));

    (this as Connection).set({ ready: true });

    return this;
  }

  async valid(type: Query.Table){
    const { table } = type;
    const db = await this.db();

    const tableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);

    if (!tableExists)
      return false;

    const columns = await db.all(`PRAGMA table_info(${table})`) as TableInfo[];
    const absent: Field[] = [];

    for (const field of type.fields.values()) {
      if (field.parts)
        continue;

      const columnInfo = columns.find(col => col.name === field.column);

      if (columnInfo)
        await this.checkIntegrity(field, columnInfo);
      else
        absent.push(field);
    }

    return absent;
  }

  protected async checkIntegrity(field: Field, info: TableInfo){
    const { column, nullable, primary, reference } = field;
    const parent = field.parent!;

    const expected = affinity(field);

    if (info.type.toUpperCase() !== expected)
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${info.type}, expected ${expected}`
      );

    if (!primary && info.notnull === (nullable ? 1 : 0))
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    if (!reference)
      return;

    const foreignKey = reference.column;
    const foreignTable = reference.parent!.table;

    if (reference.parent!.connection !== this)
      throw new Error(
        `Foreign key ${foreignTable}.${foreignKey} cannot be checked by another connection`
      );

    const db = await this.db();

    const foreignTableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [foreignTable]);

    if (!foreignTableExists)
      throw new Error(`Referenced table ${foreignTable} does not exist`);

    const foreignColumn = (await db.all(`PRAGMA table_info(${foreignTable})`))
      .find(col => col.name === foreignKey);

    if (!foreignColumn)
      throw new Error(
        `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
      );
  }

  protected async createSchema(types: Iterable<Query.Table>): Promise<void> {
    const schema = this.generateSchema(types);

    if (schema)
      await (await this.db()).exec(schema);
  }

  protected generateSchema(types: Iterable<Query.Table>): string {
    return Array.from(types)
      .map(type => this.generateTableSchema(type))
      .join('\n');
  }

  protected generateTableSchema(type: Query.Table): string {
    const { parts } = type.fields.get("id")!;
    const fields = Array.from(type.fields.values()).filter(field => !field.parts).map(definition);

    if (parts)
      fields.push(`PRIMARY KEY (${parts.map(part => `\`${part.column}\``).join(', ')})`);

    return `CREATE TABLE ${type.table} (${fields.join(', ')});`;
  }
}

function definition(field: Field){
  const {
    column,
    fallback,
    reference,
    increment,
    nullable,
    primary,
    unique,
  } = field;

  const { onDelete, onUpdate } = field as Field & { onDelete?: string, onUpdate?: string };
  let parts = `\`${column}\` ${affinity(field)}`;

  if (!nullable) parts += ' NOT NULL';
  if (primary)   parts += ' PRIMARY KEY';
  if (increment) parts += ' AUTOINCREMENT';
  if (unique)    parts += ' UNIQUE';

  if (fallback !== undefined)
    parts += ' DEFAULT ' + literal(field, fallback);

  if (reference)
    parts += ` REFERENCES ${reference.parent!.table}(${reference.column})`;

  if (onDelete) parts += ` ON DELETE ${onDelete}`;
  if (onUpdate) parts += ` ON UPDATE ${onUpdate}`;

  return parts;
}

function unfit({ primary, unique, nullable, fallback }: Field){
  if (primary)
    return "is a primary key and cannot be added to an existing table.";

  if (unique)
    return "is UNIQUE and cannot be added by SQLite.";

  if (!nullable && fallback === undefined)
    return "is NOT NULL without a default and cannot be added to existing rows.";

  if (fallback === "NOW")
    return "defaults to the current time and cannot be added by SQLite.";
}

const AFFINITY: Record<string, string> = {
  integer: "INTEGER",
  smallint: "INTEGER",
  bigint: "INTEGER",
  boolean: "INTEGER",
  real: "REAL",
  float: "REAL",
  double: "REAL",
  numeric: "NUMERIC",
  decimal: "NUMERIC",
  text: "TEXT",
  varchar: "TEXT",
  char: "TEXT",
  uuid: "TEXT",
  timestamp: "TEXT",
  date: "TEXT",
  time: "TEXT"
};

function affinity(field: Field){
  return AFFINITY[field.type] || field.datatype.toUpperCase();
}

function literal(field: Field, value: unknown){
  if (value === "NOW")
    return "CURRENT_TIMESTAMP";

  if (value === null)
    return "NULL";

  const encoded = field.set(value);

  return typeof encoded == "string"
    ? `'${encoded.replace(/'/g, "''")}'`
    : String(encoded);
}

function pretty(sql: string){
  try {
    return format(sql, { language: 'sqlite', keywordCase: "upper" })
      .replace(/ - > > /g, " ->> ")
      .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
  }
  catch {
    return sql;
  }
}