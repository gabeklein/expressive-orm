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

  type Transaction = Base.Journal & {
    session?: unknown;
  };
}

type Scope = Map<Connection, Connection.Transaction>;

let storage: Promise<import('node:async_hooks').AsyncLocalStorage<Scope>> | undefined;
let context: import('node:async_hooks').AsyncLocalStorage<Scope> | undefined;

function hooks(name: string): Promise<typeof import('node:async_hooks')> {
  return import(name);
}

function scope(){
  return storage ||= hooks("node:async_hooks").then(
    ({ AsyncLocalStorage }) => context = new AsyncLocalStorage<Scope>(),
    () => {
      storage = undefined;
      throw new Error("Transactions need AsyncLocalStorage, which this runtime does not provide.");
    }
  );
}

function ref({ schema, table }: Query.Table){
  return schema ? `${schema}.${table}` : table;
}

abstract class Connection extends Base {
  _active?: Promise<void>;

  abstract get schema(): string;

  abstract sync(fix?: boolean): Promise<this>;

  abstract prepare(builder: Builder): Builder.Statement;

  protected transact?<T>(fn: () => Promise<T>): Promise<T>;

  _journal(){
    return context?.getStore()?.get(this);
  }

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (!this.transact)
      throw new Error(`${this.constructor.name} does not support transactions.`);

    const storage = await scope();
    const outer = storage.getStore();

    if (outer?.has(this))
      return fn();

    const release = await this.lock();
    const journal: Connection.Transaction = { undo: [], done: [] };

    try {
      const result = await storage.run(new Map(outer).set(this, journal), () => this.transact!(async () => fn()));

      journal.done.forEach(apply => apply());

      return result;
    }
    catch (error) {
      journal.undo.reverse().forEach(apply => apply());
      throw error;
    }
    finally {
      release();
    }
  }

  protected async lock(){
    while (this._active)
      await this._active;

    let release!: () => void;

    this._active = new Promise(resolve => release = resolve);

    return () => {
      this._active = undefined;
      release();
    };
  }

  protected async idle(){
    while (this._active && !this._journal())
      await this._active;
  }

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
        update: conflict.update?.map(column => lookup(target, column))
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
