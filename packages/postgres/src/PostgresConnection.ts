import './columns';

import { Builder, Field, Query, Type } from '@expressive/orm';
import { Connection } from '@expressive/sql';
import { format } from 'sql-formatter';

import { PostgresGenerator } from './PostgresGenerator';

const TYPE_SYNONYMS: Record<string, string> = {
  "int": "integer",
  "int2": "smallint",
  "int4": "integer",
  "int8": "bigint",
  "smallserial": "smallint",
  "serial": "integer",
  "bigserial": "bigint",
  "float4": "real",
  "float": "double precision",
  "float8": "double precision",
  "double": "double precision",
  "decimal": "numeric",
  "varchar": "character varying",
  "char": "character",
  "bpchar": "character",
  "timestamp": "timestamp without time zone",
  "timestamptz": "timestamp with time zone",
  "time": "time without time zone",
  "timetz": "time with time zone",
  "bool": "boolean"
}

function base(type: string){
  const name = type.toLowerCase().replace(/\(.*?\)| collate .*/g, "").replace(/\s+/g, " ").trim();

  return name.startsWith("interval") ? "interval" : TYPE_SYNONYMS[name] || name;
}

const CHANNEL = "expressive_orm";

const NOTIFY = `
CREATE OR REPLACE FUNCTION expressive_notify() RETURNS trigger AS $$
DECLARE
  rec jsonb;
  id jsonb;
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  IF TG_NARGS > 1 THEN
    id := '[]'::jsonb;

    FOR i IN 0 .. TG_NARGS - 1 LOOP
      id := id || jsonb_build_array(rec -> TG_ARGV[i]);
    END LOOP;
  ELSE
    id := rec -> TG_ARGV[0];
  END IF;

  payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', lower(TG_OP), 'id', id);

  IF TG_OP <> 'DELETE' AND octet_length((payload || jsonb_build_object('row', rec))::text) < 8000 THEN
    payload := payload || jsonb_build_object('row', rec);
  END IF;

  PERFORM pg_notify('${CHANNEL}', payload::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;`;

export abstract class PostgresConnection extends Connection {
  protected engine: unknown;

  _unlisten?: Promise<void>;

  get schema() {
    return format(this.generateSchema(this.using));
  }

  prepare(from: Builder | string) {
    const sql = typeof from == "string" ? from : String(new PostgresGenerator(from));

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

    const counts = typeof from != "string" && !from.returns && !from.inserts.size && !from.updates.size && !from.deletes.size;

    return {
      all: async (params?: any[]) => (await send(params)).rows,
      run: counts
        ? async (params?: any[]) => Number(Object.values((await send(params)).rows[0])[0])
        : async (params?: any[]) => (await send(params)).affectedRows || 0,
      toString: () => format(sql, { language: 'postgresql', keywordCase: "upper" })
    };
  }

  abstract query(sql: string, params?: any[]): Promise<{ rows: any[], affectedRows?: number }>;

  abstract exec(sql: string): Promise<void>;

  protected abstract listen(channel: string, callback: (payload: string) => void): Promise<() => Promise<void>>;

  subscribe(listener: (change: Connection.Change) => void){
    const listening = this.listen(CHANNEL, payload => {
      const change = parse(payload);
      const type = change && Array.from(this.using).find(type => type.table === change.table) as typeof Type | undefined;

      if (type && OPS.includes(change.op) && change.id != null)
        listener({ ...change, table: type.ref });
    });

    return () => {
      this._unlisten = listening.then(stop => stop());
    };
  }

  async close(){
    await super.close();
    await this._unlisten;
  }

  async verify(fix = false){
    const required = new Set(this.using);
    const tables = await getTableInformation.call(this);
    const added: Field[] = [];

    const messages = [] as string[];

    for (const Type of required) {
      const { fields, table } = Type;
      const columns = tables[table];

      if(!columns)
        continue;

      for(const [_column, field] of fields) {
        if(!field.datatype)
          continue;

        const info = columns[field.column];

        if(!info){
          const reason = unfit(field);

          if(fix && !reason)
            added.push(field);
          else if(field.optional){
            field.absent = true;
            field.get = () => undefined;
          }
          else if(fix)
            messages.push(`Column "${field.column}" in table ${table} ${reason}`);
          else
            messages.push(`Column "${field.column}" does not exist in table ${table}`);

          continue;
        }
          
          const { reference } = field;
          const parent = field.parent!;
          const { nullable } = info;

          if ((nullable === 'YES') === !field.nullable){
            messages.push(
              `Column "${field.column}" in table ${parent.table} has incorrect nullable value`
            );
            continue;
          }
            
      
          if (base(info.type) !== base(field.datatype)){
            messages.push(
              `Column "${field.column}" in table ${parent.table} has type "${info.type.toLowerCase()}", expected "${field.datatype.toLowerCase()}"`
            );
            continue;
          }

          if (!reference) continue;

          const foreignKey = reference.column;
          const {
            table: foreignTable,
            connection: foreignConnection
          } = reference.parent!;

          if (foreignConnection !== this){
            messages.push(
              `Column "${field.column}" in table ${parent.table} references a foreign connection`
            );
            continue;
          }

          const foreign = tables[foreignTable];

          if (!foreign){
            messages.push(`Referenced table ${foreignTable} does not exist`);
            continue;
          }

          const foreignExists = foreign[foreignKey];

          if (!foreignExists){
            messages.push(
              `Referenced column ${foreignKey} does not exist in table ${foreignTable}`
            );
            continue;
          }
      }

      required.delete(Type);
    }

    if (messages.length)
      throw new Error("Schema verification failed:\n" + messages.join('\n'));

    return { tables: required, columns: added };
  }

  async sync(fix = true) {
    if(!this.engine)
      throw new Error("Connection engine is not initialized.");

    if (this.ready)
      throw new Error("Connection is already active.");

    for (const type of this.using)
      if (type.schema)
        throw new Error(`static schema is not supported by ${this.constructor.name}.`);

    const { tables: required, columns } = await this.verify(fix);

    if(required.size)
      if(fix)
        await this.createSchema(required);
      else {
        const missing = Array.from(required).map(t => t.table);
        const message = missing.length > 1
          ? `Tables ${missing.join(', ')} are expected but do not exist.`
          : `Table ${missing[0]} is expected but does not exist.`;
        
        throw new Error(message);
      }

    if(columns.length)
      await this.exec(generateColumns(columns));

    await this.exec(this.generateTriggers(this.using));

    (this as Connection).set({ ready: true });

    return this;
  }

  protected fetch<T>(query: string, params: unknown[]) {
    return this.query(query, params).then(x => x.rows) as Promise<T[]>;
  }

  protected async createSchema(types: Iterable<Query.Table>): Promise<void> {
    const schema = this.generateSchema(types);
    await this.exec(schema);
  }

  protected generateSchema(types: Iterable<Query.Table>): string {
    const schemas = Array.from(types).map(type => this.generateTableSchema(type));
    const statements = [
      ...schemas.map(s => s.table),
      ...schemas.map(s => s.constraints)
    ]

    return statements.join('\n');
  }

  protected generateTriggers(types: Iterable<Query.Table>): string {
    const triggers = Array.from(types, ({ table, fields }) => {
      const { column, parts = [{ column }] } = fields.get("id")!;

      return (
        `CREATE OR REPLACE TRIGGER "${table}_notify" AFTER INSERT OR UPDATE OR DELETE ON "${table}" ` +
        `FOR EACH ROW EXECUTE FUNCTION expressive_notify(${parts.map(part => `'${part.column}'`).join(", ")});`
      );
    });

    return [NOTIFY, ...triggers].join('\n');
  }

  protected generateTableSchema(type: Query.Table) {
    const { table, fields } = type;
    const { parts } = fields.get("id")!;
    const values = Array.from(fields.values()).filter(field => !field.parts);
    const columns = values.map(definition);

    if (parts)
      columns.push(`PRIMARY KEY (${parts.map(part => `"${part.column}"`).join(", ")})`);

    return {
      table: `CREATE TABLE "${table}" (${columns.join(", ")});`,
      constraints: values.flatMap(field => foreignKey(table, field)).join('\n')
    };
  }
}

function definition(field: Field){
  const {
    column,
    datatype,
    fallback,
    increment,
    nullable,
    primary,
    unique,
  } = field;

  let parts = `"${column}" ${datatype.toUpperCase()}`;

  if (!nullable) parts += ' NOT NULL';
  if (increment) parts += ' GENERATED BY DEFAULT AS IDENTITY';
  if (primary)   parts += ' PRIMARY KEY';
  if (unique)    parts += ' UNIQUE';

  if (fallback !== undefined)
    parts += ' DEFAULT ' + literal(field, fallback);

  return parts;
}

function foreignKey(table: string, field: Field){
  const { column, reference } = field;
  const { onDelete, onUpdate } = field as Field & { onDelete?: string, onUpdate?: string };

  if (!reference)
    return [];

  let constraint =
    `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fk" ` +
    `FOREIGN KEY ("${column}") REFERENCES "${reference.parent!.table}"("${reference.column}")`;

  if (onDelete) constraint += ` ON DELETE ${onDelete}`;
  if (onUpdate) constraint += ` ON UPDATE ${onUpdate}`;

  return [constraint + ";"];
}

function generateColumns(fields: Field[]){
  const columns = fields.map(field => `ALTER TABLE "${field.parent!.table}" ADD COLUMN ${definition(field)};`);
  const constraints = fields.flatMap(field => foreignKey(field.parent!.table, field));

  return [...columns, ...constraints].join('\n');
}

function unfit({ primary, unique, nullable, fallback }: Field){
  if (primary)
    return "is a primary key and cannot be added to an existing table.";

  if (!nullable && fallback === undefined)
    return "is NOT NULL without a default and cannot be added to existing rows.";

  if (unique && fallback != null)
    return "is UNIQUE with a default and cannot be added to existing rows.";
}

const OPS = ["insert", "update", "delete"];

function parse(payload: string): Connection.Change | undefined {
  try {
    return JSON.parse(payload);
  }
  catch {
    return;
  }
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