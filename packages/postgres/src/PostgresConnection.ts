import './columns/Bool';
import './columns/Num';
import './columns/One';
import './columns/Str';
import './columns/Time';

import { Connection, Field, Table } from '@expressive/sql';
import { format } from 'sql-formatter';
import { PostgresGenerator } from './PostgresGenerator';

import type { Pool, PoolConfig } from 'pg';
import type { PGlite, PGliteOptions } from '@electric-sql/pglite';

/**
 * Unified PostgresConnection that supports both node-postgres (pg) and PGlite
 */
const TYPE_SYNONYMS: Record<string, string> = {
  "int2": "smallint",
  "int4": "integer",
  "int8": "bigint",
  "real": "float",
  "double precision": "double",
  "character varying": "varchar",
  "character": "char",
  "numeric": "decimal",
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamptz",
  "time without time zone": "time",
  "time with time zone": "timetz",
  "interval without time zone": "interval",
  "interval with time zone": "interval",
  "boolean": "bool",
  "bytea": "binary"
}

export class PostgresConnection extends Connection {
  static generator = PostgresGenerator;

  protected engine: unknown;
  protected engineType: 'pg' | 'pglite';

  /**
   * Create a PostgresConnection with auto-detection of available drivers
   */
  constructor(using: Connection.Types);
  
  /**
   * Create a PostgresConnection with PG Pool
   */
  constructor(using: Connection.Types, pool: Pool);
  
  /**
   * Create a PostgresConnection with PG connection string
   */
  constructor(using: Connection.Types, connectionString: string);
  
  /**
   * Create a PostgresConnection with PG pool config
   */
  constructor(using: Connection.Types, config: PoolConfig);
  
  /**
   * Create a PostgresConnection from existing PGlite instance
   */
  constructor(using: Connection.Types, engine: PGlite);
  
  /**
   * Create a PostgresConnection with PGlite data directory and options
   */
  constructor(using: Connection.Types, dataDir: string, config: PGliteOptions);
  
  constructor(
    using: Connection.Types, 
    arg2?: string | PoolConfig | Pool | PGlite, 
    arg3?: PGliteOptions
  ) {
    super(using);

    if(
      typeof arg2 === 'object' &&
      "query" in arg2 &&
      "exec" in arg2 &&
      "close" in arg2
    ){
      this.engine = arg2;
      this.engineType = 'pglite';
      return;
    }

    const pg = pgPool(arg2);

    if(pg){
      this.engine = pg;
      this.engineType = 'pg';
      return;
    }

    if(typeof arg2 !== "object"){
      const pglite = pgLite(arg2, arg3);

      if(pglite){
        this.engine = pglite;
        this.engineType = 'pglite';
        return;
      }
    }

    throw new Error(
      'No PostgreSQL adapter found. You can install either "pg" or "@electric-sql/pglite" to resolve this issue.'
    );
  }

  get schema() {
    return format(this.generateSchema(this.using));
  }

  prepare<T = any>(sql: string) {
    const send = async (params?: any[]) => {
      try {
        return await this.query(sql, params);
      }
      catch (error) {
        if(error instanceof Error && error.message.includes('syntax error'))
          throw new Error(`Syntax error in query: ${sql}`);

        throw error;
      }
    }

    return {
      all: async (params?: any[]) => (await send(params)).rows as T[],
      get: async (params?: any[]) => (await send(params)).rows[0] as T | undefined,
      run: async (params?: any[]) => (await send(params)).affectedRows || 0,
      toString: () => format(sql, { language: 'postgresql', keywordCase: "upper" })
    };
  }

  async query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }> {
    if (this.engineType === 'pg') {
      const result = await (this.engine as Pool).query(sql, params);
      return {
        rows: result.rows,
        affectedRows: result.rowCount || undefined
      };
    } else {
      return (this.engine as PGlite).query(sql, params);
    }
  }

  async execScript(sql: string): Promise<void> {
    await (
      this.engineType === 'pg' ?
        (this.engine as Pool).query(sql) :
        (this.engine as PGlite).exec(sql)
    );
  }

  async closeConnection(): Promise<void> {
    return this.engineType === 'pg' ?
      (this.engine as Pool).end() :
      (this.engine as PGlite).close();
  }

  async close() {
    super.close();
    await this.closeConnection();
  }

  async sync(fix?: boolean) {
    if(!this.engine)
      throw new Error("Connection engine is not initialized.");

    if (this.ready)
      throw new Error("Connection is already active.");

    const required = new Set(this.using);

    for (const type of required) {
      void type.fields;
      const valid = await this.valid(type);

      if(valid)
        required.delete(type);

      else if (fix !== true)
        throw new Error(`Table ${type.table} does not exist.`);
    }

    if(required.size)
      if(fix === true)
        await this.createSchema(required);
      else
        throw new Error(`Tables ${Array.from(required).map(t => t.table).join(', ')} are expected Types do not exist.`);

    Object.defineProperty(this, 'ready', { value: true });

    return this;
  }

  protected fetch<T>(query: string, params: unknown[]) {
    return this.query(query, params).then(x => x.rows) as Promise<T[]>;
  }

  async valid(type: Table.Type): Promise<boolean> {
    const { fields, table } = type;
    
    const tableExists = await this.fetch(
      'SELECT FROM information_schema.tables WHERE table_name = $1', [table]
    );

    if (!tableExists.length) return false;

    const rows = await this.fetch<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string;
    }>(
      'SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1',
      [table]
    );

    await Promise.all(Array.from(fields.values(), field => {
      return this.checkIntegrity(table, field, 
        rows.find(col => col.column_name === field.column)
      );
    }));

    return true;
  }

  protected async checkIntegrity(
    table: string,
    field: Field,
    info: undefined | {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string;
    }
  ) {
    const { column, datatype, nullable, parent, reference } = field;

    if(!datatype)
      return;

    if (!info)
      if(field.optional){
        field.absent = true;
        field.get = () => undefined;
        return;
      }
      else
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

    const { is_nullable, data_type } = info;

    if ((is_nullable === 'YES') === !nullable)
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    const A = data_type.toLowerCase();
    const B = datatype.toLowerCase();

    if (A !== B && A !== TYPE_SYNONYMS[B] && B !== TYPE_SYNONYMS[A])
      throw new Error(
        `Column ${column} in table ${parent.table} has type "${A}", expected "${B}"`
      );

    if (!reference) return;

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

    const foreignExists = await this.fetch(
      'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      [foreignTable, foreignKey]
    );

    if (!foreignExists.length)
      throw new Error(
        `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
      );
  }

  protected async createSchema(types: Iterable<typeof Table>): Promise<void> {
    const schema = this.generateSchema(types);
    await this.execScript(schema);
  }

  protected generateSchema(types: Iterable<typeof Table>): string {
    const schemas = Array.from(types).map(type => this.generateTableSchema(type));
    const statements = [
      ...schemas.map(s => s.table),
      ...schemas.map(s => s.constraints)
    ]

    return statements.join('\n');
  }

  protected generateTableSchema(type: Table.Type) {
    const { table, fields } = type;

    const constraints: string[] = [];
    const columns = Array.from(fields.values()).map(field => {
      const {
        column,
        datatype,
        fallback,
        reference,
        increment,
        nullable,
        unique,
      } = field;

      const type = datatype.toUpperCase();
      let parts = `"${column}" ${type}`;
   
      if (!nullable) parts += ' NOT NULL';
      if (increment) parts += ' GENERATED ALWAYS AS IDENTITY'; 
      if (unique)    parts += ' UNIQUE';
      if (fallback)  parts += ' DEFAULT ' + field.set(fallback);
   
      if (reference)
        constraints.push(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fk" ` +
          `FOREIGN KEY ("${column}") REFERENCES "${reference.parent.table}"("${reference.column}");`
        );
   
      return parts;
    });
   
    return {
      table: `CREATE TABLE "${table}" (${columns.join(", ")});`,
      constraints: constraints.join('\n')
    };
  }
}

function pgLite(dataDir?: string, options?: PGliteOptions){
  try {
    const pglite = require('@electric-sql/pglite') as { PGlite: typeof PGlite };
    return new pglite.PGlite(dataDir, options);
  } catch (e) {
    return null;
  }
}

function pgPool(arg?: PoolConfig | Pool | string){
  try {
    const pg = require('pg') as { Pool: typeof Pool };

    if(arg instanceof pg.Pool)
      return arg;

    if(typeof arg === 'string')
      arg = { connectionString: arg };

    return new pg.Pool(arg);
    return;
  } catch (e) {
    return null;
  }
}