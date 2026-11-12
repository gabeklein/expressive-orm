import { Field, now, Query, type Type } from '@expressive/orm';
import { Builder, Parameter } from '@expressive/orm/driver';
import { Connection } from '@expressive/sql';
import type { Pool, PoolConnection, PoolOptions, ResultSetHeader } from 'mysql2/promise';
import { format } from 'sql-formatter';

import { codecs } from './codecs';
import { escape, now as current, MySQLGenerator } from './MySQLGenerator';

const TYPE_SYNONYMS: Record<string, string> = {
  "integer": "int",
  "boolean": "tinyint",
  "bool": "tinyint",
  "double precision": "double",
  "real": "double",
  "numeric": "decimal",
  "character": "char",
  "character varying": "varchar"
};

function base(type: string){
  const name = type.toLowerCase().replace(/\(.*?\)| collate .*| unsigned/g, "").replace(/\s+/g, " ").trim();

  return TYPE_SYNONYMS[name] || name;
}

type Client = Pool | PoolConnection;

interface ColumnInfo {
  table: string;
  column: string;
  type: string;
  nullable: string;
}

function typeCast(field: { type: string, string(): string | null }, next: () => unknown){
  if (field.type === "DATETIME" || field.type === "TIMESTAMP" || field.type === "DATE")
    return field.string();

  return next();
}

function encode(values: unknown[]){
  return values.map(value => (
    value !== null && typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value
  ));
}

export class MySQLConnection extends Connection {
  protected get codecs(){
    return codecs;
  }

  protected engine: Promise<Pool>;

  private owned = false;

  constructor(using: Connection.Types, config: string | PoolOptions | Pool) {
    super(using);

    this.engine = import("mysql2/promise").then(({ createPool }) => {
      if (typeof config != "string" && "getConnection" in config)
        return config as Pool;

      this.owned = true;

      return createPool(typeof config == "string" ? { uri: config } : config);
    }, (err: Error) => {
      throw new Error(`Attempted to load mysql2 but failed: ${err.message}`);
    });
  }

  get schema() {
    return format(this.generateSchema(this.using), { language: 'mysql', keywordCase: "upper" });
  }

  protected async client(): Promise<Client> {
    return (this._journal()?.session as PoolConnection | undefined) || this.engine;
  }

  async query(sql: string, params: unknown[] = []): Promise<any> {
    const client = await this.client();
    const [result] = await client.query({ sql, values: encode(params), typeCast } as any);

    return result;
  }

  protected fetch<T>(sql: string, params: unknown[] = []) {
    return this.query(sql, params) as Promise<T[]>;
  }

  prepare(builder: Builder) {
    const generator = new MySQLGenerator(builder);
    const sql = String(generator);
    const order = generator.placed.slice();
    const bind = (params: unknown[] = []) => order.map(param => params[builder.params.indexOf(param)]);

    const send = async (text: string, values: unknown[]) => {
      try {
        return await this.query(text, values);
      }
      catch (error) {
        if (error instanceof Error && /syntax/i.test(error.message))
          throw new Error(`${error.message}\nin query: ${text}`);

        throw error;
      }
    };

    const returning = builder.inserts.size && builder.returns
      ? this.returning(builder, generator)
      : undefined;

    const counts = !builder.returns && !builder.inserts.size && !builder.updates.size && !builder.deletes.size;

    return {
      all: async (params?: unknown[]) => {
        if (!returning)
          return send(sql, bind(params));

        const header = await send(sql, bind(params)) as ResultSetHeader;

        if (!header.affectedRows)
          return [];

        return send(returning.sql, returning.values(params || [], header.insertId));
      },
      run: counts
        ? async (params?: unknown[]) => Number(Object.values((await send(sql, bind(params)))[0])[0])
        : async (params?: unknown[]) => ((await send(sql, bind(params))) as ResultSetHeader).affectedRows,
      toString: () => format(sql, { language: 'mysql', keywordCase: "upper" })
    };
  }

  protected returning(builder: Builder, generator: MySQLGenerator){
    const { conflict, inserts, tables } = builder;

    if (tables.size > 1)
      throw new Error("MySQL cannot return rows from an insert across joined tables.");

    const [[table, data]] = inserts;
    const id = table.fields.get("id")!;
    const serial = id.increment && !id.parts;
    const keys = serial ? [id] : conflict ? conflict.on : id.parts || [id];

    const values = new Map(Array.from(data, ([field, value]) => [field.column, value]));

    const take = keys.map(field => {
      const value = values.get(field.column);

      if (serial)
        return (_params: unknown[], insertId: number) => insertId;

      if (value instanceof Parameter)
        return (params: unknown[]) => params[builder.params.indexOf(value)];

      if (value === undefined || value === now || value instanceof Field || typeof value == "object" && value !== null)
        throw new Error(`MySQL cannot return the row inserted into ${table.name} without a value for ${field.column}.`);

      return () => value;
    });

    const where = keys.map(field => `${generator.escape(table.name)}.${generator.escape(field.column)} = ?`);

    return {
      sql: `${generator.reselect()} WHERE ${where.join(' AND ')} LIMIT 1`,
      values: (params: unknown[], insertId: number) => take.map(get => get(params, insertId))
    };
  }

  protected async lock(){
    return () => {};
  }

  protected async idle(){}

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    const client = await (await this.engine).getConnection();

    this._journal()!.session = client;

    try {
      await client.query("START TRANSACTION");

      try {
        const result = await fn();

        await client.query("COMMIT");

        return result;
      }
      catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
    finally {
      client.release();
    }
  }

  async close(){
    await super.close();

    const engine = await this.engine;

    if (this.owned)
      await engine.end();
  }

  async verify(fix = false){
    const { tables, columns, messages } = await this.inspect(fix);

    if (messages.length)
      throw new Error("Schema verification failed:\n" + messages.map(({ message }) => message).join('\n'));

    return { tables, columns };
  }

  protected async inspect(fix: boolean){
    const required = new Set(this.using);
    const tables = await this.tables();
    const added: Field[] = [];
    const messages: { message: string, drift?: Field }[] = [];

    for (const Type of required) {
      const { fields, table } = Type;
      const columns = tables[table];

      if (!columns)
        continue;

      for (const field of fields.values()) {
        if (field.parts)
          continue;

        const info = columns[field.column];

        if (!info) {
          const shift = moved(field, Object.keys(columns));
          const reason = unfit(field);

          if (shift)
            messages.push({ message: `Column "${field.column}" in table ${table} ${shift}` });
          else if (fix && !reason)
            added.push(field);
          else if (field.optional) {
            field.absent = true;
            field.get = () => undefined;
          }
          else if (fix)
            messages.push({ message: `Column "${field.column}" in table ${table} ${reason}` });
          else
            messages.push({ message: `Column "${field.column}" does not exist in table ${table}` });

          continue;
        }

        if ((info.nullable === 'YES') === !field.nullable)
          messages.push({ message: `Column "${field.column}" in table ${table} has incorrect nullable value`, drift: field });

        if (base(info.type) !== base(datatype(field)))
          messages.push({
            message: `Column "${field.column}" in table ${table} has type "${info.type.toLowerCase()}", expected "${datatype(field).toLowerCase()}"`,
            drift: field
          });

        const { reference } = field;

        if (!reference)
          continue;

        const { table: foreignTable, connection } = reference.parent!;

        if (connection !== this)
          messages.push({ message: `Column "${field.column}" in table ${table} references a foreign connection` });
        else if (!tables[foreignTable]) {
          if (!fix || !this.using.has(reference.parent!))
            messages.push({ message: `Referenced table ${foreignTable} does not exist` });
        }
        else if (!tables[foreignTable][reference.column])
          messages.push({ message: `Referenced column ${reference.column} does not exist in table ${foreignTable}` });
      }

      required.delete(Type);
    }

    return { tables: required, columns: added, messages, info: tables };
  }

  async plan(force = false): Promise<Connection.Plan> {
    const steps: Connection.Step[] = [];
    const problems: string[] = [];

    for (const type of this.using)
      if (type.schema)
        problems.push(`static schema is not supported by ${this.constructor.name}.`);

    if (problems.length)
      return { steps, problems };

    const { tables: required, columns, messages, info } = await this.inspect(true);
    const drift = new Map<Field, string[]>();

    for (const { message, drift: field } of messages)
      if (force && field)
        drift.set(field, [...drift.get(field) || [], message]);
      else
        problems.push(message);

    const created = Array.from(required, type => ({ type, ...this.generateTableSchema(type) }));

    for (const { type, table } of created)
      steps.push({ table: type.table, action: `create table ${type.table}`, reason: `Table ${type.table} does not exist.`, sql: [table] });

    if (created.length)
      steps[steps.length - 1].sql.push(...created.flatMap(({ constraints }) => constraints));

    for (const field of columns) {
      const { table } = field.parent!;

      steps.push({
        table,
        column: field.column,
        action: `add column ${field.column} to ${table}`,
        reason: `Column "${field.column}" does not exist in table ${table}`,
        sql: [`ALTER TABLE \`${table}\` ADD COLUMN ${definition(field)};`, ...foreignKey(table, field)]
      });
    }

    for (const [field, reasons] of drift) {
      const { table } = field.parent!;
      const { column, nullable } = field;
      const current = info[table][column];

      if ((current.nullable === 'YES') && !nullable) {
        const [{ count }] = await this.fetch<{ count: number }>(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE \`${column}\` IS NULL`);

        if (count) {
          problems.push(`Column "${column}" in table ${table} cannot be rebuilt: ${count} ${count == 1 ? "row is" : "rows are"} NULL.`);
          continue;
        }
      }

      steps.push({
        table,
        column,
        action: `alter column ${column} on ${table}`,
        reason: reasons.join("; "),
        sql: [`ALTER TABLE \`${table}\` MODIFY COLUMN ${definition(field, false)};`]
      });
    }

    for (const field of await this.unindexed())
      steps.push(indexStep(field));

    return { steps, problems };
  }

  protected async unindexed(){
    const rows = await this.fetch<{ table: string, column: string }>(`
      SELECT table_name AS \`table\`, MIN(column_name) AS \`column\`
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
      GROUP BY table_name, index_name
      HAVING COUNT(*) = 1
    `);

    const covered = new Set(rows.map(({ table, column }) => `${table}.${column}`));

    return Array.from(this.using).flatMap(type => (
      indexed(type).filter(field => !covered.has(`${type.table}.${field.column}`))
    ));
  }

  protected async tables(){
    const rows = await this.fetch<ColumnInfo>(`
      SELECT
        table_name AS \`table\`,
        column_name AS \`column\`,
        column_type AS \`type\`,
        is_nullable AS \`nullable\`
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
      ORDER BY table_name, ordinal_position
    `);

    const tables: Record<string, Record<string, ColumnInfo>> = {};

    for (const row of rows)
      (tables[row.table] ||= {})[row.column] = row;

    return tables;
  }

  async sync(fix = true, force = false) {
    if (this.ready)
      throw new Error("Connection is already active.");

    const { steps, problems } = await this.plan(force);
    const issues = fix ? problems : [...problems, ...steps.map(step => step.reason)];

    if (issues.length)
      throw new Error("Schema verification failed:\n" + issues.join('\n'));

    for (const sql of steps.flatMap(step => step.sql))
      await this.query(sql);

    (this as Connection).set({ ready: true });

    return this;
  }

  protected generateSchema(types: Iterable<Query.Table>): string {
    const schemas = Array.from(types, type => this.generateTableSchema(type));

    return [...schemas.map(s => s.table), ...schemas.flatMap(s => s.constraints)].join('\n');
  }

  protected generateTableSchema(type: Query.Table) {
    const { table, fields } = type;
    const { parts } = fields.get("id")!;
    const values = Array.from(fields.values()).filter(field => !field.parts);
    const columns = values.map(field => definition(field));

    if (parts)
      columns.push(`PRIMARY KEY (${parts.map(part => `\`${part.column}\``).join(", ")})`);

    return {
      table: `CREATE TABLE \`${table}\` (${columns.join(", ")});`,
      constraints: values.flatMap(field => foreignKey(table, field))
    };
  }
}

function connection(field: Field){
  return (field.parent as Type.Class).connection;
}

function datatype(field: Field){
  return connection(field)._datatype(field);
}

function definition(field: Field, keys = true){
  const { column, fallback, increment, nullable, primary, unique } = field;

  let parts = `\`${column}\` ${datatype(field).toUpperCase()}`;

  if (!nullable) parts += ' NOT NULL';

  if (fallback !== undefined)
    parts += ` DEFAULT (${literal(field, fallback)})`;

  if (increment) parts += ' AUTO_INCREMENT';

  if (keys) {
    if (primary) parts += ' PRIMARY KEY';
    if (unique)  parts += ' UNIQUE';
  }

  return parts;
}

function foreignKey(table: string, field: Field){
  const { column, reference } = field;
  const { onDelete, onUpdate } = field as Field & { onDelete?: string, onUpdate?: string };

  if (!reference)
    return [];

  let constraint =
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${table}_${column}_fk\` ` +
    `FOREIGN KEY (\`${column}\`) REFERENCES \`${reference.parent!.table}\`(\`${reference.column}\`)`;

  if (onDelete) constraint += ` ON DELETE ${onDelete}`;
  if (onUpdate) constraint += ` ON UPDATE ${onUpdate}`;

  return [constraint + ";"];
}

function indexed({ fields }: Query.Table){
  return Array.from(fields.values()).filter(field => field.index && !field.primary && !field.unique);
}

function indexName(field: Field){
  return typeof field.index == "string" ? field.index : `${field.parent!.table}_${field.column}`;
}

function indexStep(field: Field): Connection.Step {
  const { table } = field.parent!;

  return {
    table,
    column: field.column,
    action: `create index ${indexName(field)} on ${table}`,
    reason: `Index ${indexName(field)} does not exist on ${table}`,
    sql: [`CREATE INDEX \`${indexName(field)}\` ON \`${table}\` (\`${field.column}\`);`]
  };
}

function moved(field: Field, existing: string[]){
  const { entity } = field as Field & { entity?: Query.Table };
  const old = entity && `${entity.table}_id`;
  const taken = Array.from(field.parent!.fields.values()).some(other => other.column === old);

  if (old && !taken && existing.includes(old))
    return `is missing but ${old} exists; add { column: "${old}" } to ${field.parent!.name}.${field.key} to keep it.`;
}

function unfit({ primary, unique, nullable, fallback }: Field){
  if (primary)
    return "is a primary key and cannot be added to an existing table.";

  if (!nullable && fallback === undefined)
    return "is NOT NULL without a default and cannot be added to existing rows.";

  if (unique && fallback != null)
    return "is UNIQUE with a default and cannot be added to existing rows.";
}

function literal(field: Field, value: unknown){
  if (value === "NOW" || value === now)
    return current(field);

  if (value === null)
    return "NULL";

  return String(escape(connection(field)._encode(field, field.set(value))));
}
