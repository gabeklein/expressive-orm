import './columns/Bool';
import './columns/Num';
import './columns/One';
import './columns/Str';
import './columns/Time';

import { Builder, Connection, Field, Table } from '@expressive/sql';
import Database from 'better-sqlite3';
import { format } from 'sql-formatter';

import { SQLiteGenerator } from './SQLiteGenerator';

type TableInfo = { 
  name: string; 
  type: string; 
  notnull: number; 
  dflt_value: any
};

export class SQLiteConnection extends Connection {
  protected declare engine: Database.Database;

  constructor(using: Connection.Types, filename?: string) {
    super(using);
    this.engine = new Database(filename || ':memory:');
  }

  get schema() {
    return pretty(this.generateSchema(this.using));
  }

  prepare<T = any>(builder: Builder){
    const sql = String(new SQLiteGenerator(builder));

    try {
      const stmt = this.engine.prepare(sql);
      const string = (x?: unknown[]) => x
        ? x.map(x => typeof x === 'object' ? JSON.stringify(x) : x)
        : [];
  
      return {
        all: async (p?: any[]) => stmt.all(string(p)) as T[],
        run: async (p?: any[]) => stmt.run(string(p)).changes,
        toString: () => pretty(sql)
      };
    }
    catch (err) {
      if(err instanceof Error)
        throw new Error(`Error preparing SQL: ${err.message}\n${pretty(sql)}`);
      
      throw err;
    }
  }

  async close(){
    this.engine.close();
  }

  async sync(fix?: boolean){
    if (this.ready)
      throw new Error("Connection is already active.");

    for (const type of this.using)
      if (!this.valid(type) && fix !== true)
        throw new Error(`Table ${type.table} does not exist.`);

    this.createSchema(this.using);
    Object.defineProperty(this, 'ready', { value: true });

    return this;
  }

  async valid(type: Table.Type){
    const { table } = type;
    const fields = Array.from(type.fields.values());
    
    // Check if table exists
    const tableExists = this.engine
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    
    if (!tableExists)
      return false;

    // Get column information
    const columns = this.engine
      .prepare(`PRAGMA table_info(${table})`)
      .all() as TableInfo[];

    for (const field of fields) {
      if (!field.datatype)
        continue;

      const columnInfo = columns.find(col => col.name === field.column);

      if (!columnInfo)
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      this.checkIntegrity(field, columnInfo);
    }

    return true;
  }

  protected checkIntegrity(field: Field, info: TableInfo){
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

    const foreignTableExists = this.engine
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(foreignTable);

    if (!foreignTableExists)
      throw new Error(`Referenced table ${foreignTable} does not exist`);

    const foreignColumn = this.engine
      .prepare<any[], any>(`PRAGMA table_info(${foreignTable})`)
      .all()
      .find(col => col.name === foreignKey);

    if (!foreignColumn)
      throw new Error(
        `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
      );
  }

  protected createSchema(types: Iterable<typeof Table>): void {
    this.engine.exec(this.generateSchema(types));
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