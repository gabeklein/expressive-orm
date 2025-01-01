import Database from 'better-sqlite3';

import { Connection, Field, Query, Type } from '..';
import { assign, create } from '../utils';

type TableInfo = { 
  name: string; 
  type: string; 
  notnull: number; 
  dflt_value: any
};

export class SQLiteConnection extends Connection {
  protected engine: Database.Database;

  constructor(using: Connection.Types, filename?: string) {
    super(using);
    this.engine = new Database(filename || ':memory:');
  }

  get schema() {
    return this.generateSchema(this.using);
  }

  toRunner<T>(builder: Query.Builder<T>): () => Query<T> | Query.Selects<T> {
    type Q = Query<any>;

    const sql = String(builder);
    const parse = builder.parse.bind(builder);
    const statement = this.engine.prepare<any[], {}>(sql);

    return function runner(...args: any[]) { 
      args = builder.accept(args);

      const query = create(Query.prototype) as Q;
      const all = () => statement.all(args).map(parse);
      const run = () => statement.run(args).changes;
      
      assign(query, {
        params: args,
        toString: () => sql,
        then(resolve, reject){
          try {
            if(resolve)
              resolve(builder.selects ? all() : run());
          }
          catch (err) {
            if(reject)
              reject(err);
          }
        }
      } as Q);

      if (builder.selects)
        assign(query, {
          get: async () => all(),
          one: async (orFail?: boolean) => {
            const res = statement.get();

            if(res)
              return parse(res);

            if (orFail)
              throw new Error("Query returned no results.");
          }
        });

      return query;
    }
  }

  async run(qs: string, params?: any[]): Promise<void> {
    this.engine.prepare(qs).run(params || []);
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
  }

  async valid(type: Type.EntityType){
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

  protected generateSchema(types: Iterable<typeof Type>): string {
    return Array.from(types)
      .map(type => this.generateTableSchema(type))
      .join('\n');
  }

  protected createSchema(types: Iterable<typeof Type>): void {
    for (const type of types) {
      const schema = this.generateTableSchema(type);
      this.engine.exec(schema);
    }
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
        parts += ` DEFAULT ${field.set(field.fallback)}`;

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
}