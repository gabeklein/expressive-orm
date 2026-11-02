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
        typeof x === 'object' ? JSON.stringify(x) :
        typeof x === 'boolean' ? Number(x) :
        x
      ))
      : [];

    const run = async <R>(op: (engine: Engine) => Promise<R>) => {
      try {
        return await op(await this.db());
      }
      catch (err) {
        if(err instanceof Error)
          throw new Error(`Error running SQL: ${err.message}\n${pretty(sql)}`);

        throw err;
      }
    };

    return {
      all: (p?: any[]) => run(e => e.all(sql, string(p))),
      run: (p?: any[]) => run(e => e.run(sql, string(p)).then(r => r.changes)),
      toString: () => pretty(sql)
    };
  }

  async close(){
    if (this.engine)
      await (await this.engine).close();

    await super.close();
  }

  async sync(fix = true){
    if (this.ready)
      throw new Error("Connection is already active.");

    const missing: Query.Table[] = [];

    for (const type of this.using)
      if (await this.valid(type))
        continue;
      else if (fix)
        missing.push(type);
      else
        throw new Error(`Table ${type.table} does not exist.`);

    await this.createSchema(missing);
    (this as Connection).set({ ready: true });

    return this;
  }

  async valid(type: Query.Table){
    const { table } = type;
    const fields = Array.from(type.fields.values());
    const db = await this.db();

    const tableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);

    if (!tableExists)
      return false;

    const columns = await db.all(`PRAGMA table_info(${table})`) as TableInfo[];

    for (const field of fields) {
      const columnInfo = columns.find(col => col.name === field.column);

      if (!columnInfo)
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      await this.checkIntegrity(field, columnInfo);
    }

    return true;
  }

  protected async checkIntegrity(field: Field, info: TableInfo){
    const { column, nullable, reference } = field;
    const parent = field.parent!;

    const expected = affinity(field);

    if (info.type.toUpperCase() !== expected)
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${info.type}, expected ${expected}`
      );

    if (info.notnull === (nullable ? 1 : 0))
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
    const fields = Array.from(type.fields.values()).map(field => {
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
    });

    return `CREATE TABLE ${type.table} (${fields.join(', ')});`;
  }
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
  return format(sql, { language: 'sqlite', keywordCase: "upper",  })
    .replace(/ - > > /g, " ->> ")
    .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
}