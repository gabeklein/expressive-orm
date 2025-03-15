import { Connection, Field, Type } from '@expressive/sql';
import { format } from 'sql-formatter';

import { PostgresGenerator } from './PostgresGenerator';

export abstract class PostgresConnection extends Connection {
  static generator = PostgresGenerator;

  protected engine: unknown;

  constructor(using: Connection.Types, engine: unknown) {
    super(using);
    this.engine = engine;
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

  abstract query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }>;
  abstract execScript(sql: string): Promise<void>;
  abstract closeConnection(): Promise<void>;

  async close() {
    super.close();
    await this.closeConnection();
  }

  async sync(fix?: boolean) {
    if (this.ready)
      throw new Error("Connection is already active.");

    for (const type of this.using) {
      const valid = await this.valid(type);

      if (!valid && fix !== true)
        throw new Error(`Table ${type.table} does not exist.`);
    }

    await this.createSchema(this.using);
    Object.defineProperty(this, 'ready', { value: true });
  }

  protected fetch<T>(query: string, params: unknown[]) {
    return this.query(query, params).then(x => x.rows) as Promise<T[]>;
  }

  async valid(type: Type.EntityType): Promise<boolean> {
    const { table } = type;
    
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

    for (const field of type.fields.values()) {
      if (!field.datatype) continue;

      const columnInfo = rows.find(col => col.column_name === field.column);

      if (!columnInfo)
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      await this.checkIntegrity(field, columnInfo);
    }

    return true;
  }

  protected async checkIntegrity(
    field: Field,
    info: {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string;
    }
  ) {
    const { column, datatype, nullable, parent, foreignTable, foreignKey } = field;

    if (this.mapDataType(datatype).toLowerCase() !== info.data_type.toLowerCase())
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${info.data_type}, expected ${datatype}`
      );

    if ((info.is_nullable === 'YES') === !nullable)
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    if (!foreignTable || !foreignKey) return;

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

  protected async createSchema(types: Iterable<typeof Type>): Promise<void> {
    const schema = this.generateSchema(types);
    await this.execScript(schema);
  }

  protected generateSchema(types: Iterable<typeof Type>): string {
    const schemas = Array.from(types).map(type => this.generateTableSchema(type));
    const statements = [
      ...schemas.map(s => s.table),
      ...schemas.map(s => s.constraints)
    ]

    return statements.join('\n');
  }

  protected generateTableSchema(type: Type.EntityType) {
    const { table, fields } = type;

    const constraints: string[] = [];
    const columns = Array.from(fields.values()).map(field => {
      const {
        column, datatype, fallback, foreignKey,
        foreignTable, increment, nullable, unique,
      } = field;
   
      if (foreignKey && foreignTable)
        constraints.push(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fk" ` +
          `FOREIGN KEY ("${column}") REFERENCES "${foreignTable}"("${foreignKey}");`
        );

      let parts = `"${column}" ${this.mapDataType(datatype!)}`;
   
      if (!nullable) parts += ' NOT NULL';
      if (increment) parts += ' GENERATED ALWAYS AS IDENTITY'; 
      if (unique) parts += ' UNIQUE';
      if (fallback !== undefined) parts += ' DEFAULT ' + field.set(fallback);
   
      return parts;
    });
   
    return {
      table: `CREATE TABLE "${table}" (${columns.join(", ")});`,
      constraints: constraints.join('\n')
    };
  }

  protected mapDataType(datatype: string): string {
    const typeMap: Record<string, string> = {
      'varchar': 'TEXT',
      'int': 'INTEGER',
      'float': 'REAL',
      'double': 'DOUBLE PRECISION',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'datetime': 'TIMESTAMP',
      'timestamp': 'TIMESTAMP'
    };

    const baseType = datatype.split('(')[0].toLowerCase();
    return typeMap[baseType] || datatype;
  }
}