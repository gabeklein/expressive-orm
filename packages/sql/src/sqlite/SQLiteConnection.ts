import { Field, now, Query } from '@expressive/orm';
import { Builder } from '@expressive/orm/driver';
import { Connection } from '../connection/Connection';
import { format } from 'sql-formatter';

import { createEngine, type D1Database, Engine, host, type LibSQLClient, migrations } from './engine';
import { now as current, SQLiteGenerator } from './SQLiteGenerator';

type TableInfo = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: any
};

/**
 * A connection to SQLite - a file, in memory, a libSQL address, a D1 binding, a libSQL client or a given `Engine`.
 *
 * The built-in loader takes the first of `bun:sqlite`, `node:sqlite`, `better-sqlite3`, `sqlite3`, `@libsql/client`, with foreign keys on.
 * Awaiting it runs `sync`. No live rows.
 *
 * @example
 * const db = await SQLiteConnection.new([User, Post], "app.db");
 */
export class SQLiteConnection extends Connection {
  protected filename: string;
  protected engine?: Promise<Engine>;
  protected owned = true;

  /**
   * Bind `using` to a SQLite database. Construct with `SQLiteConnection.new`.
   *
   * Without `source`, the database is in memory. A filename opens through the built-in loader.
   * A `libsql:`, `https:`, `http:`, `ws:` or `wss:` address opens a `@libsql/client` 0.18 or later - pass a token as `?authToken=`.
   * A D1 binding, a libSQL client or an `Engine` is used as given - foreign keys are not switched on, and `close()` leaves it open.
   * D1 refuses `transaction`. libSQL runs each `transaction` on a libSQL write transaction, one at a time.
   */
  constructor(using: Connection.Types, source?: string | Engine | D1Database | LibSQLClient) {
    super(using);

    if (typeof source == "object") {
      (this.engine = Promise.resolve(source).then(host)).catch(() => {});
      this.owned = false;
    }

    this.filename = typeof source == "string" && source || ':memory:';
  }

  protected db(){
    return this.engine ??= createEngine(this.filename);
  }

  async #statements(): Promise<Engine.Statements> {
    await this.idle();

    return this._journal()?.session as Engine.Session || this.db();
  }

  /** `CREATE TABLE` and `CREATE INDEX` statements for the bound classes, formatted. */
  get schema() {
    return pretty(this.generateSchema(this.using));
  }

  /**
   * Compile a builder to SQLite SQL.
   *
   * A failure when run rethrows as `Error running SQL: <message>` with the statement.
   */
  prepare(builder: Builder){
    const sql = String(new SQLiteGenerator(builder));
    const string = (x?: unknown[]) => x
      ? x.map(x => (
        x !== null && typeof x === 'object' ? JSON.stringify(x) :
        typeof x === 'boolean' ? Number(x) :
        x
      ))
      : [];

    const run = async <R>(op: (engine: Engine.Statements) => Promise<R>) => {
      try {
        return await op(await this.#statements());
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
    const session = this._journal()!.session = await db.transaction?.();

    if (!session)
      await db.exec("BEGIN");

    try {
      const result = await fn();

      await (session ? session.commit() : db.exec("COMMIT"));

      return result;
    }
    catch (error) {
      await (session ? session.rollback() : db.exec("ROLLBACK")).catch(() => {});
      throw error;
    }
  }

  /** Close the database when this connection opened it, then release the connection. */
  async close(){
    const engine = await this.engine?.catch(() => undefined);

    if (engine && this.owned)
      await engine.close();

    await super.close();
  }

  /**
   * Bring the database in line with the bound classes, then mark the connection ready.
   *
   * Creates missing tables and adds missing columns and indexes, in one transaction. Throws for any problem `plan` reports, changing nothing.
   * `fix` false only verifies - anything missing throws too. `force` rebuilds a table whose column type or nullability drifted.
   * Throws when the connection is already ready.
   */
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

  /**
   * List what `sync` would do, without doing it.
   *
   * `problems` are what it cannot fix - drift without `force`, a column SQLite cannot add, a missing referenced table, `static schema`.
   */
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
        steps.push({ table, action: `create table ${table}`, reason: `Table ${table} does not exist.`, sql: [this.tableSchema(type), ...indexed(type).map(index)] });
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
    const rebuilds = steps.some(step => step.action.startsWith("rebuild"));
    const sql = steps.flatMap(step => step.sql);
    const migrate = migrations.get(db);

    if (migrate && rebuilds) {
      await intact(db);
      return void await migrate(sql);
    }

    const guard = rebuilds && (await db.get("PRAGMA foreign_keys"))?.foreign_keys;

    if (db.batch && !guard)
      return db.batch(sql);

    if (db.batch) {
      await db.exec("PRAGMA foreign_keys = OFF").catch(() => {});

      try {
        if ((await db.get("PRAGMA foreign_keys")).foreign_keys)
          throw new Error("Cannot rebuild: this engine keeps foreign keys on, so dropping the table would cascade.");

        await intact(db);

        return await db.batch(sql);
      }
      finally {
        await db.exec("PRAGMA foreign_keys = ON").catch(() => {});
      }
    }

    if (guard)
      await db.exec("PRAGMA foreign_keys = OFF");

    await db.exec("BEGIN");

    try {
      await db.exec(sql.join("\n"));

      if (guard)
        await intact(db);

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
    const db = await this.#statements();

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
    const db = await this.#statements();
    const covered = new Set<string>();

    for (const { name } of await db.all(`PRAGMA index_list(${type.table})`)) {
      const columns = await db.all(`PRAGMA index_info(\`${name}\`)`);

      if (columns.length == 1)
        covered.add(columns[0].name);
    }

    return indexed(type).filter(field => !covered.has(field.column));
  }

  protected async misfit(type: Query.Table, fields: Field[], columns: TableInfo[]){
    const db = await this.#statements();
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
    const db = await this.#statements();
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

    const db = await this.#statements();

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

async function intact(db: Engine.Statements){
  const broken: { table: string }[] = await db.all("PRAGMA foreign_key_check");

  if (broken.length) {
    const tables = [...new Set(broken.map(row => row.table))].join(", ");

    throw new Error(`Cannot rebuild: ${tables} has references to missing rows (${broken.length}).`);
  }
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