import { Database } from 'sqlite3';
import { Connection, Field, Type } from '..';

type TableInfo = { 
  name: string; 
  type: string; 
  notnull: number; 
  dflt_value: any
};

export class SQLiteConnection extends Connection {
  protected engine: Database;

  constructor(using: Connection.Types, filename?: string) {
    super(using);
    this.engine = new Database(filename || ':memory:');
  }

  toString() {
    return this.generateSchema(this.using);
  }

  async send(qs: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.all(qs, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.engine.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async sync(fix?: boolean): Promise<void> {
    if (this.ready)
      throw new Error("Connection is already active.");

    const include = async (type: Type.EntityType) => {
      const valid = await this.valid(type);

      if (!valid && fix !== true) {
        throw new Error(`Table ${type.table} does not exist.`);
      }
    };

    await Promise.all(Array.from(this.using).map(include));
    await this.createSchema(this.using);

    Object.defineProperty(this, 'ready', { value: true });
  }

  async valid(type: Type.EntityType): Promise<boolean> {
    const { table } = type;
    const fields = Array.from(type.fields.values());
    
    // Check if table exists
    const tableExists = await this.send(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
    );
    
    if (!tableExists || tableExists.length === 0)
      return false;

    // Get column information
    const columns = await this.send(`PRAGMA table_info(${table})`) as TableInfo[];

    const integrity = fields.map(field => {
      const columnInfo = columns.find((col: any) => col.name === field.column);

      if (!field.datatype)
        return;

      if (!columnInfo)
        throw new Error(`Column ${field.column} does not exist in table ${table}`);

      return this.checkIntegrity(field, columnInfo);
    });

    await Promise.all(integrity);

    return true;
  }

  protected async checkIntegrity(field: Field, info: TableInfo): Promise<void> {
    const { column, datatype, nullable, parent, foreignTable, foreignKey } = field;

    // Check datatype
    if (info.type !== this.mapDataType(datatype).toLowerCase())
      throw new Error(
        `Column ${column} in table ${parent.table} has type ${info.type}, expected ${datatype}`
      );

    // Check nullable constraint
    if (info.notnull === (nullable ? 1 : 0))
      throw new Error(
        `Column ${column} in table ${parent.table} has incorrect nullable value`
      );

    // Check foreign key if present
    if (!foreignTable || !foreignKey)
      return;

    if (field.parent.connection !== this)
      throw new Error(
        `Foreign key ${foreignTable}.${foreignKey} cannot be checked by another connection`
      );

    const foreignTableExists = await this.send(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${foreignTable}'`
    );

    if (!foreignTableExists || foreignTableExists.length === 0)
      throw new Error(`Referenced table ${foreignTable} does not exist`);

    const foreignColumn = await this.send(`PRAGMA table_info(${foreignTable})`)
      .then((cols: any[]) => cols.find(col => col.name === foreignKey));

    if (!foreignColumn)
      throw new Error(
        `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
      );
  }

  protected generateSchema(types: Iterable<typeof Type>): string {
    let schema = '';
    
    for (const type of types)
      schema += this.generateTableSchema(type);
    
    return schema;
  }

  protected async createSchema(types: Iterable<typeof Type>): Promise<void> {
    for (const type of types)
      await this.send(this.generateTableSchema(type));
  }

  protected generateTableSchema(type: Type.EntityType): string {
    const fields = Array.from(type.fields.values()).map(field => {
      let parts = `\`${field.column}\` ${this.mapDataType(field.datatype!)}`;

      if (!field.nullable)
        parts += ' NOT NULL';

      if (field.increment)
        parts += ' PRIMARY KEY AUTOINCREMENT';

      if (field.unique)
        parts += ' UNIQUE';

      if (field.fallback !== undefined)
        parts += ` DEFAULT ${this.formatDefault(field.fallback)}`;

      if (field.foreignKey && field.foreignTable)
        parts += ` REFERENCES ${field.foreignTable}(${field.foreignKey})`;

      return parts;
    });

    return `CREATE TABLE ${type.table} (${fields.join(', ')});`;
  }

  private mapDataType(datatype: string): string {
    const typeMap: Record<string, string> = {
      'varchar': 'TEXT',
      'int': 'INTEGER',
      'float': 'REAL',
      'double': 'REAL',
      'boolean': 'INTEGER',
      'date': 'TEXT',
      'datetime': 'TEXT',
      'timestamp': 'TEXT'
    };

    const baseType = datatype.split('(')[0].toLowerCase();
    return typeMap[baseType] || datatype;
  }

  private formatDefault(value: any): string {
    return (
      typeof value === 'string' ? `'${value}'` :
      value === null ? 'NULL' : value.toString()
    )
  }
}