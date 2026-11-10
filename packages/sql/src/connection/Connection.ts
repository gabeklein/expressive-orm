import '../columns/Bool';
import '../columns/Num';
import '../columns/One';
import '../columns/Str';
import '../columns/Time';

import { Builder, Connection as Base, Field, Parameter, Query, Type } from '@expressive/orm';

declare namespace Connection {
  type Types = Base.Types;

  type Ready<T extends Connection = Connection> = Base.Ready<T>;

  type Change = Base.Change;

  type Conflict = Base.Conflict;

  type Key = Base.Key;

  /** An open transaction's journal. */
  type Transaction = Base.Journal;

  /** One change `sync` would make. */
  interface Step {
    table: string;
    /** Column the step adds or indexes. Absent for a table step. */
    column?: string;
    /** What it does, like `create table user`. */
    action: string;
    /** The mismatch it resolves - what `sync(false)` reports. */
    reason: string;
    /** Statements applying it. */
    sql: string[];
  }

  /** What `sync` would do, and what stops it. */
  interface Plan {
    steps: Step[];
    /** Mismatches `sync` cannot fix. Any makes it throw. */
    problems: string[];
  }
}

function ref({ schema, table }: Query.Table){
  return schema ? `${schema}.${table}` : table;
}

/**
 * Base class of a SQL driver - implements orm's `select`, `insert`, `update` and `remove` as queries through `prepare`.
 *
 * A dialect supplies `schema`, `prepare`, `sync` and `plan`, and `transact` to enable `transaction`.
 * Each statement throws when no bound or loaded class owns its table.
 */
abstract class Connection extends Base {
  /** DDL creating every bound class's table and indexes. */
  abstract get schema(): string;

  /**
   * Bring the database in line with the bound classes, then mark the connection ready.
   *
   * Creates missing tables, columns and indexes. `fix` false changes nothing and throws for anything missing.
   * `force` also converts columns whose type or nullability drifted. Throws for any problem `plan` reports.
   */
  abstract sync(fix?: boolean, force?: boolean): Promise<this>;

  /** List what `sync` would change, and what it could not, without applying anything. */
  abstract plan(force?: boolean): Promise<Connection.Plan>;

  /** Compile a `Query` builder to a statement in this dialect. */
  abstract prepare(builder: Builder): Builder.Statement;

  async select(table: string, constraints: Type.Constraint[], limit?: number, offset?: number){
    const { builder, target, bind, run } = statement(this, table);

    for (const [column, op, value] of constraints) {
      const field = lookup(target, column);

      if (op === 'asc' || op === 'desc')
        builder.order.set(field, op);
      else if (op === 'IS NULL')
        builder.filters.add(field, '=', null);
      else if (op === 'IS NOT NULL')
        builder.filters.add(field, '<>', null);
      else if (value === null)
        builder.filters.add(field, op, null);
      else
        builder.filters.add(field, op, Array.isArray(value) ? value.map(bind) : bind(value));
    }

    builder.limit = limit;
    builder.offset = offset;
    builder.commit(target.proxy);

    const rows = await this.prepare(builder).all(run());

    return rows.map(raw => decode(builder, raw));
  }

  async insert(table: string, data: Record<string, any>, returns?: boolean, conflict?: Connection.Conflict){
    const { builder, target, bind, run } = statement(this, table);
    const values: Builder.Insert = new Map();

    for (const field of target.fields.values())
      if (field.column in data)
        values.set(field, bind(data[field.column]));

    builder.inserts.set(target, values);

    if (conflict)
      builder.conflict = {
        on: conflict.on.map(column => lookup(target, column)),
        update: conflict.update?.map(column => lookup(target, column)),
        set: new Map(Object.entries(conflict.set || {}).map(([column, value]) => [lookup(target, column), bind(value)]))
      };

    if (!returns)
      return this.prepare(builder).run(run());

    builder.commit(target.proxy);

    const [row] = await this.prepare(builder).all(run());

    return row && decode(builder, row);
  }

  async update(table: string, id: Connection.Key, data: Record<string, any>){
    const { builder, target, bind, run } = statement(this, table);
    const values: Builder.Insert = new Map();

    for (const column in data)
      values.set(lookup(target, column), bind(data[column]));

    builder.updates.set(target, values);
    identify(builder, target, id, bind);

    await this.prepare(builder).run(run());
  }

  async remove(table: string, id: Connection.Key){
    const { builder, target, bind, run } = statement(this, table);

    builder.deletes.add(target);
    identify(builder, target, id, bind);

    await this.prepare(builder).run(run());
  }
}

function identify(builder: Builder, target: Builder.ITable, id: Connection.Key, bind: (value: unknown) => Parameter){
  const { parts } = target.fields.get("id")!;

  if (parts)
    parts.forEach((part, i) => builder.filters.add(lookup(target, part.column), '=', bind((id as unknown[])[i])));
  else
    builder.filters.add(target.fields.get("id")!, '=', bind(id));
}

function statement(connection: Connection, table: string){
  const type = [...connection.using, ...connection._loaded.keys()].find(type => ref(type) === table);

  if (!type)
    throw new Error(`Table ${table} is not used by this connection.`);

  const builder = new Builder();
  const target = builder.tables.get(builder.use(type))!;
  const params: unknown[] = [];

  return {
    builder,
    target,
    bind(value: unknown){
      const param = new Parameter(params.length);

      params.push(value);
      builder.params.push(param);

      return param;
    },
    run: () => builder.accept(params)
  };
}

function lookup(table: Builder.ITable, column: string){
  for (const field of table.fields.values())
    if (field.column === column)
      return field;

  throw new Error(`Column ${column} does not exist in ${table.name}.`);
}

function decode(builder: Builder, raw: Record<string, any>){
  const row: Record<string, any> = {};

  (builder.returns as Map<string, Field>).forEach((field, key) => {
    row[field.column] = raw[key];
  });

  return row;
}

export { Connection };
