import { Field, omits } from '../Field';
import type { Type } from '../Type';
import { Query } from './Query';
import { Cond, DataField, DataTable, Expression, Group, Parameter, QueryTemplate, render, Value } from './Value';

declare namespace Builder {
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

  type Insert = Map<Field, unknown>;

  interface Statement {
    all(params?: unknown[]): Promise<any[]>;
    run(params?: unknown[]): Promise<number>;
    toString(): string;
  }
}

const { assign, create, defineProperty, freeze, getOwnPropertyNames, values } = Object;

class Builder {
  connection?: Type.Connection;

  params = [] as Parameter[];

  filters = new Group();
  pending = new Set<() => void>();
  order = new Map<Field, "asc" | "desc">();
  tables = new Map<{}, Builder.ITable>();
  templates = new Set<QueryTemplate>();

  deletes = new Set<Builder.ITable>();
  updates = new Map<Builder.ITable, Builder.Insert>();
  inserts = new Map<Builder.ITable, Builder.Insert>();

  returns?: Map<string, unknown> | Field | Value;
  entity?: Builder.ITable;
  limit?: number;

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
        }
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

  commit(returns: unknown){
    this.pending.forEach(fn => fn());

    if (typeof returns === 'function')
      returns = returns();

    const entity = this.tables.get(returns as {});

    if (entity?.type) {
      const columns = new Map<string, Field>();

      entity.fields.forEach((field, key) => {
        if (!field.absent)
          columns.set(key, field);
      });

      this.entity = entity;
      this.returns = columns;
    }
    else if (returns instanceof Field || returns instanceof Value)
      this.returns = returns;
    else if (returns) {
      const columns = new Map<string, unknown>();

      function scan(obj: any, path?: string) {
        getOwnPropertyNames(obj).forEach(key => {
          const use = path ? `${path}.${key}` : key;
          let selects = obj[key];

          if (typeof selects == 'function')
            selects = selects();

          if (selects instanceof Field || selects instanceof Value || typeof selects != 'object')
            columns.set(use, selects);
          else
            scan(selects, use);
        })
      }

      scan(returns);

      this.returns = columns;
    }
  }

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

    if (schema){
      table.alias = 'T' + tables.size;
      table.name = schema + '.' + table.name;
    }

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

  with<T extends Record<string, any>>(data: Iterable<T>){
    return new DataTable(this, data).proxy;
  }

  accept(args: unknown[]){
    return this.params.map(p => p.toParam(args));
  }

  parse(raw: Record<string, any>): unknown {
    const { returns, entity } = this;

    if (returns instanceof Map){
      const type = entity?.type as { parse?(row: {}): unknown } | undefined;

      if (type?.parse){
        const row: Record<string, unknown> = {};

        returns.forEach((field, key) => {
          row[(field as Field).column] = raw[key];
        });

        return type.parse(row);
      }

      const values = {} as any;

      returns.forEach((select, column) => {
        const path = column.split('.');
        const property = path.pop()!;
        let target = values;

        for (const step of path)
          target = target[step] || (target[step] = {});

        const value = raw[column];

        if (value !== undefined)
          target[property] = value === null ? null : decode(select, value, raw);
      });

      return values;
    }

    return decode(returns, values(raw)[0], raw);
  }

  toString(){
    const { tables, inserts, updates, deletes, filters, order, limit, returns, entity } = this;
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

function decode(select: unknown, value: unknown, raw: Record<string, any>){
  return select instanceof Field ? select.get(value, raw) :
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
