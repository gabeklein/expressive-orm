import './columns/Bool';
import './columns/Num';
import './columns/One';
import './columns/Str';
import './columns/Time';

import { Builder, Connection, Field, Table } from '@expressive/sql';
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

  // Lazily resolve a driver on first use - keeps construction synchronous while
  // engine selection (and any ESM driver import) stays async.
  protected db(){
    return this.engine ??= createEngine(this.filename);
  }

  get schema() {
    return pretty(this.generateSchema(this.using));
  }

  prepare<T = any>(builder: Builder){
    const sql = String(new SQLiteGenerator(builder));
    const string = (x?: unknown[]) => x
      ? x.map(x => typeof x === 'object' ? JSON.stringify(x) : x)
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
      all: (p?: any[]) => run(e => e.all(sql, string(p))) as Promise<T[]>,
      run: (p?: any[]) => run(e => e.run(sql, string(p)).then(r => r.changes)),
      toString: () => pretty(sql)
    };
  }

  async close(){
    if (this.engine)
      await (await this.engine).close();
  }

  async sync(fix?: boolean){
    if (this.ready)
      throw new Error("Connection is already active.");

    for (const type of this.using)
      if (!this.valid(type) && fix !== true)
        throw new Error(`Table ${type.table} does not exist.`);

    await this.createSchema(this.using);
    Object.defineProperty(this, 'ready', { value: true });

    return this;
  }

  async valid(type: Table.Type){
    const { table } = type;
    const fields = Array.from(type.fields.values());
    const db = await this.db();

    // Check if table exists
    const tableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);

    if (!tableExists)
      return false;

    // Get column information
    const columns = await db.all(`PRAGMA table_info(${table})`) as TableInfo[];

    for (const field of fields) {
      if (!field.datatype)
        continue;

      const columnInfo = columns.find(col => col.name === field.column);

      if (!columnInfo)
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      await this.checkIntegrity(field, columnInfo);
    }

    return true;
  }

  protected async checkIntegrity(field: Field, info: TableInfo){
    const { column, datatype, nullable, parent, reference } = field;

    // Check datatype
    if (info.type !== datatype.toLowerCase())
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${info.type}, expected ${datatype}`
      );

    // Check nullable constraint
    if (info.notnull === (nullable ? 1 : 0))
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    if (!reference)
      return;

    const {
      column: foreignKey,
      parent: {
        table: foreignTable
      }
    } = reference;

    if (field.parent.connection !== this)
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

  protected async createSchema(types: Iterable<typeof Table>): Promise<void> {
    const schema = this.generateSchema(types);

    if (schema)
      await (await this.db()).exec(schema);
  }

  protected generateSchema(types: Iterable<typeof Table>): string {
    return Array.from(types)
      .map(type => this.generateTableSchema(type))
      .join('\n');
  }

  protected generateTableSchema(type: Table.Type): string {
    const fields = Array.from(type.fields.values()).map(field => {
      const {
        column,
        datatype,
        fallback,
        reference,
        increment,
        nullable,
        unique,
      } = field;

      let parts = `\`${column}\` ${datatype.toUpperCase()}`;

      if (!nullable) parts += ' NOT NULL';
      if (increment) parts += ' PRIMARY KEY AUTOINCREMENT';
      if (unique)    parts += ' UNIQUE';
      if (fallback)  parts += ' DEFAULT ' + field.set(fallback);

      if (reference)
        parts += ` REFERENCES ${reference.parent.table}(${reference.column})`;

      return parts;
    });

    return `CREATE TABLE ${type.table} (${fields.join(', ')});`;
  }
}

function pretty(sql: string){
  return format(sql, { language: 'sqlite', keywordCase: "upper",  })
    .replace(/ - > > /g, " ->> ")
    .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
}