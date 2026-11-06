import { Builder, Field, now, Query } from '@expressive/orm';
import { Connection } from '../connection/Connection';
import { format } from 'sql-formatter';

import { createEngine, Engine } from './engine';
import { now as current, SQLiteGenerator } from './SQLiteGenerator';

type TableInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: any
};

export class SQLiteConnection extends Connection {
  protected filename: string;
  protected engine?: Promise<Engine>;

  constructor(using: Connection.Types, source?: string | Engine) {
    super(using);

    if (typeof source == "object")
      this.engine = Promise.resolve(source);

    this.filename = typeof source == "string" && source || ':memory:';
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
        x !== null && typeof x === 'object' ? JSON.stringify(x) :
        typeof x === 'boolean' ? Number(x) :
        x
      ))
      : [];

    const run = async <R>(op: (engine: Engine) => Promise<R>) => {
      await this.idle();

      try {
        return await op(await this.db());
      }
      catch (err) {
        if(err instanceof Error)
          throw new Error(`Error running SQL: ${err.message}\n${pretty(sql)}`);

        throw err;
      }
    };

    const counts = !builder.returns && !builder.inserts.size && !builder.updates.size && !builder.deletes.size;

    return {
      all: (p?: any[]) => run(e => e.all(sql, string(p))),
      run: counts
        ? (p?: any[]) => run(e => e.get(sql, string(p)).then(row => Number(Object.values(row)[0])))
        : (p?: any[]) => run(e => e.run(sql, string(p)).then(r => r.changes)),
      toString: () => pretty(sql)
    };
  }

  protected async transact<T>(fn: () => Promise<T>): Promise<T> {
    const db = await this.db();

    await db.exec("BEGIN");

    try {
      const result = await fn();

      await db.exec("COMMIT");

      return result;
    }
    catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(){
    if (this.engine)
      await (await this.engine).close();

    await super.close();
  }

  async sync(fix = true, force = false){
    if (this.ready)
      throw new Error("Connection is already active.");

    const { steps, problems } = await this.plan(force);
    const issues = fix ? problems : [...problems, ...steps.map(step => step.reason)];

    if (issues.length)
      throw new Error(issues.join("\n"));

    if (steps.length)
      await this.apply(steps);

    (this as Connection).set({ ready: true });

    return this;
  }

  async plan(force = false): Promise<Connection.Plan> {
    const steps: Connection.Step[] = [];
    const problems: string[] = [];

    for (const type of this.using) {
      const { table } = type;

      if (type.schema) {
        problems.push(`static schema is not supported by ${this.constructor.name}.`);
        continue;
      }

      const found = await this.inspect(type, true);

      if (!found) {
        steps.push({ table, action: `create table ${table}`, reason: `Table ${table} does not exist.`, sql: [this.generateTableSchema(type)] });
        continue;
      }

      const { columns, absent, drift, issues } = found;
      const rebuild = force && drift.length > 0;

      problems.push(...issues);

      if (!rebuild)
        problems.push(...drift.map(({ message }) => message));

      for (const field of absent) {
        const reason = moved(field, columns.map(col => col.name)) || unfit(field);

        if (reason)
          problems.push(`Column ${field.column} in table ${table} ${reason}`);
        else if (!rebuild)
          steps.push({
            table,
            column: field.column,
            action: `add column ${field.column} to ${table}`,
            reason: `Column ${field.column} does not exist in table ${table}`,
            sql: [`ALTER TABLE ${table} ADD COLUMN ${definition(field, true)};`]
          });
      }

      if (rebuild) {
        const fields = drift.map(({ field }) => field);
        const misfit = await this.misfit(type, fields, columns);

        if (misfit.length)
          problems.push(...misfit);
        else
          steps.push({
            table,
            action: `rebuild table ${table}`,
            reason: drift.map(({ message }) => message).join("; "),
            sql: await this.rebuild(type, fields, columns)
          });
      }

      for (const field of await this.unindexed(type))
        steps.push({
          table,
          column: field.column,
          action: `create index ${indexName(field)} on ${table}`,
          reason: `Index ${indexName(field)} does not exist on ${table}`,
          sql: [index(field)]
        });
    }

    return { steps, problems };
  }

  protected async apply(steps: Connection.Step[]){
    const db = await this.db();
    const { foreign_keys } = await db.get("PRAGMA foreign_keys");
    const guard = foreign_keys && steps.some(step => step.action.startsWith("rebuild"));

    if (guard)
      await db.exec("PRAGMA foreign_keys = OFF");

    await db.exec("BEGIN");

    try {
      await db.exec(steps.flatMap(step => step.sql).join("\n"));

      const broken: { table: string }[] = guard ? await db.all("PRAGMA foreign_key_check") : [];

      if (broken.length)
        throw new Error(dangling(broken));

      await db.exec("COMMIT");
    }
    catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    finally {
      if (guard)
        await db.exec("PRAGMA foreign_keys = ON");
    }
  }

  async valid(type: Query.Table){
    const found = await this.inspect(type);

    if (!found)
      return false;

    const [problem] = [...found.drift.map(({ message }) => message), ...found.issues];

    if (problem)
      throw new Error(problem);

    return found.absent;
  }

  protected async inspect(type: Query.Table, planning = false){
    const { table } = type;
    const db = await this.db();

    const tableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);

    if (!tableExists)
      return false;

    const columns = await db.all(`PRAGMA table_info(${table})`) as TableInfo[];
    const absent: Field[] = [];
    const drift: { field: Field, message: string }[] = [];
    const issues: string[] = [];

    for (const field of type.fields.values()) {
      if (field.parts)
        continue;

      const info = columns.find(col => col.name === field.column);

      if (!info) {
        absent.push(field);
        continue;
      }

      const message = drifted(field, info);

      if (message)
        drift.push({ field, message });

      issues.push(...await this.references(field, planning));
    }

    return { columns, absent, drift, issues };
  }

  protected async unindexed(type: Query.Table){
    const db = await this.db();
    const covered = new Set<string>();

    for (const { name } of await db.all(`PRAGMA index_list(${type.table})`)) {
      const columns = await db.all(`PRAGMA index_info(\`${name}\`)`);

      if (columns.length == 1)
        covered.add(columns[0].name);
    }

    return indexed(type).filter(field => !covered.has(field.column));
  }

  protected async misfit(type: Query.Table, fields: Field[], columns: TableInfo[]){
    const db = await this.db();
    const { table } = type;
    const problems: string[] = [];

    for (const field of fields) {
      const info = columns.find(col => col.name === field.column)!;
      const column = `\`${field.column}\``;
      const expected = affinity(field);
      const fits = FITS[expected];
      const checks: [string, string][] = [];

      if (!field.nullable)
        checks.push([`${column} IS NULL`, "NULL"]);

      if (info.type.toUpperCase() !== expected && fits)
        checks.push([`${column} IS NOT NULL AND NOT (${fits(column)})`, `not ${expected}`]);

      for (const [where, what] of checks) {
        const { count } = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`);

        if (count)
          problems.push(
            `Column ${field.column} in table ${table} cannot be rebuilt: ${count} ${count == 1 ? "row is" : "rows are"} ${what}.`
          );
      }
    }

    return problems;
  }

  protected async rebuild(type: Query.Table, fields: Field[], columns: TableInfo[]){
    const db = await this.db();
    const { table } = type;
    const temp = `${table}__rebuild`;
    const own = Array.from(type.fields.values()).filter(field => !field.parts);
    const known = new Set(own.map(field => field.column));
    const extra = columns.filter(col => !known.has(col.name));
    const cast = new Set(fields.filter(field => (
      columns.find(col => col.name === field.column)!.type.toUpperCase() !== affinity(field)
    )));

    const copied = [
      ...own
        .filter(field => columns.some(col => col.name === field.column))
        .map(field => [field.column, cast.has(field) ? `CAST(\`${field.column}\` AS ${affinity(field)})` : `\`${field.column}\``]),
      ...extra.map(col => [col.name, `\`${col.name}\``])
    ];

    const indexes = await db.all(
      `SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL`, [table]);

    return [
      this.tableSchema(type, temp, extra.map(col => (
        `\`${col.name}\` ${col.type}` +
        (col.notnull ? " NOT NULL" : "") +
        (col.dflt_value != null ? ` DEFAULT ${col.dflt_value}` : "")
      ))),
      `INSERT INTO ${temp} (${copied.map(([column]) => `\`${column}\``).join(", ")}) ` +
      `SELECT ${copied.map(([, value]) => value).join(", ")} FROM ${table};`,
      `DROP TABLE ${table};`,
      `ALTER TABLE ${temp} RENAME TO ${table};`,
      ...indexes.map(({ sql }: { sql: string }) => `${sql};`)
    ];
  }

  protected async references(field: Field, planning: boolean): Promise<string[]> {
    const { reference } = field;

    if (!reference)
      return [];

    const foreignKey = reference.column;
    const foreignTable = reference.parent!.table;

    if (reference.parent!.connection !== this)
      return [`Foreign key ${foreignTable}.${foreignKey} cannot be checked by another connection`];

    const db = await this.db();

    const foreignTableExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [foreignTable]);

    if (!foreignTableExists)
      return planning && this.using.has(reference.parent!) ? [] : [`Referenced table ${foreignTable} does not exist`];

    const foreignColumn = (await db.all(`PRAGMA table_info(${foreignTable})`))
      .find(col => col.name === foreignKey);

    if (!foreignColumn)
      return [`Referenced column ${foreignKey} does not exist in table ${foreignTable}`];

    return [];
  }

  protected generateSchema(types: Iterable<Query.Table>): string {
    return Array.from(types)
      .map(type => this.generateTableSchema(type))
      .join('\n');
  }

  protected generateTableSchema(type: Query.Table): string {
    return [this.tableSchema(type), ...indexed(type).map(index)].join('\n');
  }

  protected tableSchema(type: Query.Table, name = type.table, extra: string[] = []){
    const { parts } = type.fields.get("id")!;
    const fields = [
      ...Array.from(type.fields.values()).filter(field => !field.parts).map(field => definition(field)),
      ...extra
    ];

    if (parts)
      fields.push(`PRIMARY KEY (${parts.map(part => `\`${part.column}\``).join(', ')})`);

    return `CREATE TABLE ${name} (${fields.join(', ')});`;
  }
}

function indexed(type: Query.Table){
  return Array.from(type.fields.values()).filter(field => field.index && !field.primary && !field.unique);
}

function dangling(rows: { table: string }[]){
  const tables = [...new Set(rows.map(row => row.table))].join(", ");

  return `Cannot rebuild: ${tables} has references to missing rows (${rows.length}).`;
}

function indexName(field: Field){
  return typeof field.index == "string" ? field.index : `${field.parent!.table}_${field.column}`;
}

function index(field: Field){
  return `CREATE INDEX IF NOT EXISTS \`${indexName(field)}\` ON ${field.parent!.table} (\`${field.column}\`);`;
}

function drifted(field: Field, info: TableInfo){
  const { column, nullable, primary } = field;
  const parent = field.parent!;
  const keyed = primary || parent.fields.get("id")!.parts?.includes(field);
  const expected = affinity(field);

  if (info.type.toUpperCase() !== expected)
    return `Column ${column} in table ${parent.table} has type ${info.type}, expected ${expected}`;

  if (!keyed && info.notnull === (nullable ? 1 : 0))
    return `Column ${column} in table ${parent.table} has incorrect nullable value`;
}

const NUMBER = (column: string) =>
  `typeof(${column}) = 'text' AND CASE WHEN json_valid(trim(${column})) THEN json_type(trim(${column})) ELSE '' END IN ('integer', 'real')`;

const FITS: Record<string, (column: string) => string> = {
  INTEGER: column =>
    `typeof(${column}) = 'integer' OR typeof(${column}) = 'real' AND ${column} = CAST(${column} AS INTEGER) ` +
    `OR ${NUMBER(column)} AND ${column} NOT GLOB '*[eE]*' AND CAST(${column} AS REAL) = CAST(${column} AS INTEGER)`,
  REAL: column =>
    `typeof(${column}) IN ('integer', 'real') OR ${NUMBER(column)}`
};

FITS.NUMERIC = FITS.REAL;

function definition(field: Field, adding?: boolean){
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

  if (fallback !== undefined && !(adding && clock(fallback)))
    parts += ' DEFAULT ' + literal(field, fallback);

  if (reference)
    parts += ` REFERENCES ${reference.parent!.table}(${reference.column})`;

  if (onDelete) parts += ` ON DELETE ${onDelete}`;
  if (onUpdate) parts += ` ON UPDATE ${onUpdate}`;

  return parts;
}

function moved(field: Field, existing: string[]){
  const { entity } = field as Field & { entity?: Query.Table };
  const old = entity && `${entity.table}_id`;
  const taken = Array.from(field.parent!.fields.values()).some(other => other.column === old);

  if (old && !taken && existing.includes(old))
    return `is missing but ${old} exists; add { column: "${old}" } to ${field.parent!.name}.${field.key} to keep it.`;
}

function clock(fallback: unknown){
  return fallback === "NOW" || fallback === now;
}

function unfit({ primary, unique, nullable, fallback }: Field){
  if (primary)
    return "is a primary key and cannot be added to an existing table.";

  if (unique)
    return "is UNIQUE and cannot be added by SQLite.";

  if (!nullable && fallback === undefined)
    return "is NOT NULL without a default and cannot be added to existing rows.";

  if (!nullable && clock(fallback))
    return "defaults to the current time and cannot be added by SQLite.";
}

const AFFINITY: Record<string, string> = {
  integer: "INTEGER",
  smallint: "INTEGER",
  bigint: "INTEGER",
  ms: "INTEGER",
  seconds: "INTEGER",
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
  const type = AFFINITY[field.type] || field.datatype.toUpperCase();

  if (!type)
    throw new Error(`Column ${field.column} has no datatype. Is @expressive/orm installed twice?`);

  return type;
}

function literal(field: Field, value: unknown){
  if (value === "NOW" || value === now)
    return `(${current(field)})`;

  if (value === null)
    return "NULL";

  const encoded = field.set(value);

  return typeof encoded == "string"
    ? `'${encoded.replace(/'/g, "''")}'`
    : String(encoded);
}

function pretty(sql: string){
  try {
    return format(sql, { language: 'sqlite', keywordCase: "upper" })
      .replace(/ - > > /g, " ->> ")
      .replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1");
  }
  catch {
    return sql;
  }
}