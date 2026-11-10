import { Field, omits, row } from '../Field';
import type { Type } from '../Type';
import { Query } from './Query';
import { Cond, DataField, DataTable, Expression, Group, Parameter, QueryTemplate, render, Value } from './Value';

declare namespace Builder {
  /** A table in a query - an entity class's, or in-memory data. */
  interface ITable {
    toString(): string;
    name: string;
    proxy: {};
    fields: Map<string, Field>;
    alias?: string;
    optional?: boolean;
    joins: Cond[];
    type?: Query.Table;
  }

  /** Column assignments of an insert or update, by field. */
  type Insert = Map<Field, unknown>;

  /** A compiled query. */
  interface Statement {
    /** Run, resolving rows keyed by selection alias. */
    all(params?: unknown[]): Promise<any[]>;
    /** Run, resolving the rows affected - for a query with no selection or write, the count. */
    run(params?: unknown[]): Promise<number>;
    /** The statement as text. */
    toString(): string;
  }
}

const { assign, create, defineProperty, freeze, getOwnPropertyNames, values } = Object;

const NESTED = new WeakMap<Builder, Map<string, Builder.ITable>>();

/**
 * What a `Query` function builds - tables, joins, filters, writes and the selection.
 *
 * A driver's `prepare(builder)` compiles it. `String(builder)` outlines it. A `Query` function runs with it as `this`.
 */
class Builder {
  /** Connection of the first table added; every other table must share it. */
  connection?: Type.Connection;

  /** Parameters in binding order. */
  params = [] as Parameter[];

  /** Top-level conditions, joined with AND. */
  filters = new Group();
  /** Work deferred until `commit`. */
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  /** Tables by the column proxy handed to the query function. */
  tables = new Map<{}, Builder.ITable>();
  templates = new Set<QueryTemplate>();

  deletes = new Set<Builder.ITable>();
  updates = new Map<Builder.ITable, Builder.Insert>();
  inserts = new Map<Builder.ITable, Builder.Insert>();

  /**
   * Upsert target of an insert.
   *
   * `on` identifies the row, `update` copies from the insert, `set` assigns values.
   */
  conflict?: { on: Field[]; update?: Field[]; set: Builder.Insert };
  /** The selection - columns by alias, or one value. Unset for a write or count. */
  returns?: Map<string, unknown> | Field | Value;
  /** The table selected whole, when the function returned a table. */
  entity?: Builder.ITable;
  limit?: number;
  offset?: number;

  /**
   * Compile through the connection into a function of the template's arguments.
   *
   * The function makes a runnable query.
   */
  prepare(): Query.TemplateSelects<any, any> | Query.Template<any> {
    const { connection } = this;
    const statement = connection?.prepare ? connection.prepare(this) : unsupported(this);

    const runner = (...args: unknown[]) => {
      const params = this.accept(args);
      const get = () => statement.all(params).then(rows => Promise.all(rows.map(row => this.parse(row))));
      const query = create(Query.prototype) as Query;

      assign(query, {
        params,
        toString: statement.toString,
        then: (resolve, reject) => {
          const run = this.returns ? get() : statement.run(params);
          return run.then(resolve, reject);
        },
        catch: reject => query.then(undefined, reject),
        finally: done => query.then(
          value => Promise.resolve(done?.()).then(() => value),
          error => Promise.resolve(done?.()).then(() => { throw error; })
        ),
        [Symbol.toStringTag]: "Query"
      } as Query);

      if (this.returns)
        assign(query, {
          get,
          one: async (orFail?: boolean) => {
            const [first] = await get();

            if (first === undefined && orFail)
              throw new Error("Query returned no results.");

            return first;
          }
        });

      return query;
    };

    return assign(runner, {
      connection,
      toString: statement.toString
    });
  }

  /** Run deferred work and record the query function's return value as the selection. */
  commit(returns: unknown){
    this.pending.forEach(fn => fn());

    if (typeof returns === 'function')
      returns = returns();

    const entity = this.tables.get(returns as {});

    if (entity?.type) {
      const columns = new Map<string, Field>();

      select(columns, entity);

      this.entity = entity;
      this.returns = columns;
    }
    else if (returns instanceof Field || returns instanceof Value)
      this.returns = returns;
    else if (returns) {
      const columns = new Map<string, unknown>();
      const nested = new Map<string, Builder.ITable>();
      const { tables } = this;

      function scan(obj: any, path?: string) {
        getOwnPropertyNames(obj).forEach(key => {
          const use = path ? `${path}.${key}` : key;
          let selects = obj[key];

          if (typeof selects == 'function')
            selects = selects();

          const table = tables.get(selects);

          if (table?.type) {
            nested.set(use, table);
            select(columns, table, use + ".");
          }
          else if (selects instanceof Field || selects instanceof Value || typeof selects != 'object')
            columns.set(use, selects);
          else
            scan(selects, use);
        })
      }

      scan(returns);
      NESTED.set(this, nested);

      this.returns = columns;
    }
  }

  /** Create `args` parameter placeholders for a template. */
  inject(args: number){
    return Array.from({ length: args }, (_, i) => {
      const p = new Parameter(i);

      return () => {
        if (this.params.includes(p))
          throw new Error(`Parameter ${i} is already defined.`);

        this.params.push(p);

        return p;
      }
    })
  }

  table(proxy: {}){
    const target = this.tables.get(proxy)!;

    return <Query.Verbs<any>> {
      delete: () => {
        this.deletes.add(target);
      },
      update: (data: Record<string, unknown>) => {
        const updates: Builder.Insert = new Map();

        for (const key in data)
          if (data[key] !== undefined)
            this.put(updates, target.fields.get(key)!, data[key]);

        this.updates.set(target, updates);
      },
      match: (data: Record<string, unknown>) => {
        for (const key in data)
          if (data[key] !== undefined)
            this.where(target.fields.get(key)!, "=", data[key]);
      }
    }
  }

  field(field: Field){
    const use = (op: string) =>
      (right: unknown, orEqual?: boolean) =>
        this.where(field, orEqual ? op + '=' : op, right);

    return {
      equal: use("="),
      in: use("IN"),
      not: use("<>"),
      over: use(">"),
      under: use("<"),
      asc: () => { this.order.set(field, "asc") },
      desc: () => { this.order.set(field, "desc") }
    }
  }

  andOr(...args: Expression[]){
    const local = new Group();

    this.filters.add(local);

    for (const eq of args){
      if (eq instanceof Cond && eq.restricted)
        throw new Error(
          `Cannot use ${eq.left} ${eq.op} ${eq.right} in a group.`
        );

      this.filters.delete(eq)
      local.add(eq);
    }

    return local;
  }

  /**
   * Add an entity class as a table, returning its column proxy.
   *
   * `arg2` true left joins; an object inserts.
   */
  use(type: Query.Table, arg2?: boolean | {}, ...rest: {}[]): {} {
    if (!this.connection)
      this.connection = type.connection;
    else if (this.connection !== type.connection)
      throw new Error(
        `Joined entity ${type.name} does not share a connection with other tables in Query.`
      );

    const { fields, schema } = type;
    const { tables } = this;

    const proxy = {};
    const table: Builder.ITable = {
      name: type.table,
      type,
      fields: new Map(),
      joins: [],
      proxy,
      optional: arg2 === true,
      toString(){
        return this.alias
          ? this.name + " " + this.alias
          : this.name;
      }
    };

    if (rest.length)
      arg2 = this.with([arg2, ...rest] as {}[]);

    if (schema)
      table.name = schema + '.' + table.name;

    if (schema || typeof arg2 != "object" && Array.from(tables.values()).some(other => other.name === table.name))
      table.alias = 'T' + tables.size;

    tables.set(proxy, table);
    fields.forEach((field, key) => {
      const clone: Field = create(field);

      clone.query = this;
      clone.table = table;
      clone.toString = () => `${table.alias || table.name}.${clone.column}`;

      table.fields.set(key, clone);

      let value: unknown;

      defineProperty(proxy, key, {
        get: () => value || (
          value = clone.use ? clone.use(this) : clone
        )
      });
    });

    if (typeof arg2 == "object")
      this.insert(table, arg2 as Record<string, unknown>);

    return freeze(proxy);
  }

  insert(table: Builder.ITable, input: Record<string, unknown>){
    const inserts: Builder.Insert = new Map();

    for (const [key, field] of table.fields)
      this.put(inserts, field, input[key]);

    this.inserts.set(table, inserts);
  }

  put(into: Builder.Insert, field: Field, value: unknown){
    if (value instanceof DataField)
      value.field = field;
    else
      value = this.digest(value, field);

    if (value !== undefined)
      into.set(field, value);
  }

  /** Encode a value for a column, passing columns and expressions through. Throws when it does not fit. */
  digest(value: unknown, field: Field){
    if (value instanceof Field || value instanceof Value)
      return value;

    if (value === null){
      if (field.nullable)
        return null;

      throw new Error(`Column ${field} is not nullable.`);
    }

    if (value === undefined){
      if (!field.nullable && !omits(field))
        throw new Error(`Can't assign to \`${field}\`. A value is required but got undefined.`);

      return;
    }

    try {
      return field.set(value);
    }
    catch (err: unknown){
      throw new Error(`Provided value for ${field} is not acceptable.\n${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Add a condition - a join when `right` is a column, else a filter.
   *
   * Throws for `null` against a non-nullable column.
   */
  where(left: Field, op: string, right: unknown){
    if (typeof right == "function")
      right = right();

    if (right === null && !left.nullable)
      throw new Error(`Column ${left} is not nullable.`);

    if (right instanceof Field || right instanceof DataField){
      const where = new Cond(left, op, right, true);

      if (right instanceof DataField){
        right.field = left;
        right.table.joins.push(where);
      }
      else
        left.table!.joins.push(where);

      return where;
    }

    if (right instanceof Parameter)
      right.digest = left.set.bind(left);

    return this.filters.add(left, op, right);
  }

  /** Add in-memory rows as a table. */
  with<T extends Record<string, any>>(data: Iterable<T>){
    return new DataTable(this, data).proxy;
  }

  /** Resolve the bound values for a run from the template's arguments. */
  accept(args: unknown[]){
    return this.params.map(p => p.toParam(args));
  }

  /** Decode a raw result row into the selection's shape, frozen. */
  async parse(raw: Record<string, any>): Promise<unknown> {
    const { returns, entity } = this;

    if (returns instanceof Map){
      if (entity)
        return entry(entity, raw);

      const nested = NESTED.get(this)!;
      const objects: {}[] = [];
      const values = {} as any;

      function into(path: string[]){
        let target = values;

        for (const step of path) {
          if (!target[step])
            objects.push(target[step] = {});

          target = target[step];
        }

        return target;
      }

      for (const [column, select] of returns) {
        const prefix = column.slice(0, column.lastIndexOf("."));

        if (nested.has(prefix))
          continue;

        const path = column.split('.');
        const property = path.pop()!;
        const target = into(path);
        const value = raw[column];

        if (value !== undefined)
          target[property] = value === null ? undefined : decode(select, value, raw);
      }

      for (const [use, table] of nested) {
        const path = use.split('.');
        const property = path.pop()!;
        const target = into(path);

        const { parts } = table.fields.get("id")!;
        const probe = parts ? parts[0].key : "id";

        target[property] = raw[use + "." + probe] == null ? undefined : await entry(table, raw, use + ".");
      }

      objects.forEach(freeze);

      return freeze(values);
    }

    return decode(returns, values(raw)[0], raw);
  }

  /** An outline of the query, for a connection without SQL. */
  toString(){
    const { tables, inserts, updates, deletes, filters, order, limit, offset, returns, entity } = this;
    const lines: string[] = [];
    let from = "from";

    tables.forEach(table => {
      if (inserts.has(table))
        return;

      let line: string;

      if (table instanceof DataTable)
        line = `with ${table} (${Array.from(table.used, x => x.column).join(", ")}) [${table.output.length}]`;
      else {
        line = `${table.optional ? "left join" : from} ${table}`;
        from = "join";
      }

      if (table.joins.length)
        line += " on " + table.joins.map(condition).join(" and ");

      lines.push(line);
    });

    filters.children.forEach(child => {
      lines.push("where " + expression(child, true));
    });

    inserts.forEach((data, table) => {
      lines.push(`insert ${table}`, ...assigns(data));
    });

    updates.forEach((data, table) => {
      lines.push(`update ${table}`, ...assigns(data));
    });

    deletes.forEach(table => {
      lines.push(`delete ${table}`);
    });

    if (order.size)
      lines.push("order " + Array.from(order, ([field, dir]) => `${field} ${dir}`).join(", "));

    if (limit)
      lines.push(`limit ${limit}`);

    if (offset)
      lines.push(`offset ${offset}`);

    if (entity)
      lines.push(`select ${entity}`);
    else if (returns instanceof Map)
      lines.push("select", ...Array.from(returns, ([key, value]) => `  ${key}: ${render(value)}`));
    else if (returns)
      lines.push(`select ${render(returns)}`);
    else if (!inserts.size && !updates.size && !deletes.size)
      lines.push("select count");

    return lines.join("\n");
  }
}

function select(columns: Map<string, unknown>, table: Builder.ITable, prefix = ""){
  table.fields.forEach((field, key) => {
    if (!field.absent)
      columns.set(prefix + key, field);
  });
}

function entry(table: Builder.ITable, raw: Record<string, any>, prefix = ""){
  const columns: Record<string, unknown> = {};

  table.fields.forEach((field, key) => {
    columns[field.column] = raw[prefix + key];
  });

  return row(table.fields, columns);
}

function decode(select: unknown, value: unknown, raw: Record<string, any>){
  return select instanceof Field ? select.get(value ?? undefined, raw) :
    select instanceof Parameter ? select.digest(value) :
    value;
}

function condition({ left, op, right }: Cond){
  return `${left} ${op} ${render(right)}`;
}

function expression(item: Expression, or: boolean): string {
  if (item instanceof Cond)
    return condition(item);

  return Array.from(item.children, child => (
    child instanceof Group && child.size > 1
      ? `(${expression(child, !or)})`
      : expression(child, !or)
  )).join(or ? " or " : " and ");
}

function assigns(data: Builder.Insert){
  return Array.from(data, ([field, value]) => `  ${field.key}: ${render(value)}`);
}

function unsupported(builder: Builder): Builder.Statement {
  async function fail(): Promise<never> {
    throw new Error("Query needs a connection with prepare() to run.");
  }

  return {
    all: fail,
    run: fail,
    toString: () => String(builder)
  };
}

export {
  Builder
};
