import './columns/Bool';
import './columns/Num';
import './columns/One';
import './columns/Str';
import './columns/Time';

import { Builder, Connection, Table } from '@expressive/sql';
import { format } from 'sql-formatter';

import { PostgresGenerator } from './PostgresGenerator';

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

export abstract class PostgresConnection extends Connection {
  protected engine: unknown;

  get schema() {
    return format(this.generateSchema(this.using));
  }

  prepare<T = any>(from: Builder | string) {
    const sql = typeof from == "string" ? from : String(new PostgresGenerator(from));

    const send = async (params?: any[]) => {
      try {
        return await this.execute(sql, params);
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

  abstract execute(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }>;

  abstract exec(sql: string): Promise<void>;

  async verify(){
    const required = new Set(this.using);
    const tables = await getTableInformation.call(this);

    for (const Type of required) {
      const { fields, table } = Type;
      const columns = tables[table];

      if(!columns)
        continue;

      for(const [_column, field] of fields) {
        if(!field.datatype)
          continue;

        const info = columns[field.column];

        if(!info)
          if(field.optional){
            field.absent = true;
            field.get = () => undefined;
            continue;
          }
          else
            throw new Error(`Column ${field.column} does not exist in table ${table}`);

          const { parent, reference } = field;
          const { nullable } = info;

          if ((nullable === 'YES') === !field.nullable)
            throw new Error(
              `Column ${column} in table ${parent.table} has incorrect nullable value`
            );
      
          const A = info.type.toLowerCase();
          const B = field.datatype.toLowerCase();
      
          if (A !== B && A !== TYPE_SYNONYMS[B] && B !== TYPE_SYNONYMS[A])
            throw new Error(
              `Column ${column} in table ${parent.table} has type "${A}", expected "${B}"`
            );
      
          if (!reference) continue;

          const {
            column: foreignKey,
            parent: {
              table: foreignTable,
              connection: foreignConnection
            }
          } = reference;

          if (foreignConnection !== this)
            throw new Error(
              `Foreign key ${foreignTable}.${foreignKey} cannot be checked by another connection`
            );

          const foreign = tables[foreignTable];

          if (!foreign)
            throw new Error(`Referenced table ${foreignTable} does not exist`);

          const foreignExists = foreign[foreignKey];

          if (!foreignExists)
            throw new Error(
              `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
            );
      }

      required.delete(Type);
    }

    return required;
  }

  async sync(fix?: boolean) {
    if(!this.engine)
      throw new Error("Connection engine is not initialized.");

    if (this.ready)
      throw new Error("Connection is already active.");

    const required = await this.verify();

    if(required.size)
      if(fix === true)
        await this.createSchema(required);
      else {
        const missing = Array.from(required).map(t => t.table);
        const message = missing.length > 1
          ? `Tables ${missing.join(', ')} are expected but do not exist.`
          : `Table ${missing[0]} is expected but does not exist.`;
        
        throw new Error(message);
      }

    Object.defineProperty(this, 'ready', { value: true });

    return this;
  }

  protected fetch<T>(query: string, params: unknown[]) {
    return this.execute(query, params).then(x => x.rows) as Promise<T[]>;
  }

  protected async createSchema(types: Iterable<typeof Table>): Promise<void> {
    const schema = this.generateSchema(types);
    await this.exec(schema);
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

interface ColumnInfo {
  schema: string;
  table: string;
  column: string;
  type: string;
  nullable: string;
  default: string;
  constraint: string;
  fk_column_name: string;
  referenced_table: string;
  referenced_column: string;
}

async function getTableInformation(this: PostgresConnection){
  const info = await this.fetch(`
    SELECT 
        c.table_schema as "schema",
        c.table_name as "table",
        c.column_name as "column",
        c.data_type as "type",
        c.is_nullable as "nullable",
        c.column_default as "default",
        tc.constraint_type as "constraint",
        kcu.column_name AS fk_column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
    FROM 
        information_schema.columns c
    LEFT JOIN 
        information_schema.constraint_column_usage ccu 
        ON c.table_schema = ccu.table_schema 
        AND c.table_name = ccu.table_name 
        AND c.column_name = ccu.column_name
    LEFT JOIN 
        information_schema.key_column_usage kcu 
        ON ccu.constraint_name = kcu.constraint_name 
        AND ccu.table_schema = kcu.table_schema
    LEFT JOIN 
        information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name 
        AND kcu.table_schema = tc.table_schema
    WHERE 
        c.table_schema IN ('public')
    ORDER BY 
        c.table_schema, c.table_name, c.column_name;
  `, []);

  const tables: Record<string, Record<string, ColumnInfo>> = {};
  
  for (const row of info as ColumnInfo[]) {
    let { table } = row;
    let columns = tables[table];

    if (!columns)
      tables[table] = columns = {};
    
    columns[row.column] = row;
  }

  return tables;
}