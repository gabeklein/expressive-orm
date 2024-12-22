import { Connection, Field, Type } from '..';
import { assign, create, defineProperty, freeze, getOwnPropertyNames } from '../utils';
import { Computed, math, MathOps } from './math';
import { sql, Syntax } from './syntax';

const RelevantTable = new WeakMap<{}, Query.Table>();
const INERT = new Connection([], {
  client: "sqlite3",
  useNullAsDefault: true,
  pool: { max: 0 }
})

declare namespace Query { 
  interface Table<T extends Type = any> {
    type: Type.EntityType<T>;
    query: QueryBuilder;
    name: string;
    proxy: Query.From<T>;
    alias?: string;
    join?: {
      as: Query.Join.Mode;
      on: Set<Syntax>;
    }
    toString(): string;
  }

  type Compare = Syntax | Compare[] | undefined;

  type FieldOrValue<T> = T extends Value<infer U> ? U : T;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  namespace Join {
    type Mode = "left" | "inner";

    // TODO: does not chain like actual Compare
    type Where = <T extends Field>(field: T) => Field.Compare<FieldOrValue<T>>;

    type Function = (on: Where) => void;

    type Equal<T extends Type = any> = { [K in keyof T]?: Field };
    
    type On<T extends Type> = Function | Equal<T>;

    type Left<T extends Type> = Partial<From<T>>;
  }

  type Join<T extends Type> = From<T>;

  type Value<T = any> = T | Field<T> | Computed<T>;
  type ANumeric = Value<string | number>;
  type Numeric = Value<number>;

  type Where = 
    & typeof where
    & MathOps
    & {
      is: typeof where;
      limit: (to: number ) => void
    };

  interface Verbs <T extends Type> {
    delete(): void;
    update(values: Query.Update<T>): void;
  }

  // TODO: test new nullable awareness
  type Update<T extends Type> = {
    [K in Type.Fields<T>]?: Field.Updates<T[K]>;
  }

  type Function<R> = (where: Where) => R;

  type Template<A, R> = (where: Where, ...args: A[]) => R;

  type Extract<T> =
    T extends Field.Returns<infer R> ? R :
    T extends From<infer U> ? { [J in Type.Fields<U>]: Extract<U[J]> } :
    T extends {} ? { [K in keyof T]: Extract<T[K]> } :
    T;

  type Asserts<T extends Field> = ReturnType<T["compare"]> & {
    asc(): void;
    desc(): void;
  };
}

interface Query<T = unknown> extends PromiseLike<T> {
  /** Counts the number of rows that would be selected. */
  count(): Promise<number>;

  /** Returns the SQL string generated by this query. */
  toString(): string;
}

interface SelectQuery<T = unknown> extends Query<T[]> {
  /**
   * Returns the first rows which match creteria.
   * 
   * @param limit The maximum number of rows to return.
   */
  get(limit?: number): Promise<T[]>;

  /**
   * Returns the first row that matches creteria.
   * 
   * @param orFail If true, will throw an error if no results are returned.
   */
  one(orFail?: boolean): Promise<T>;
}

function Query<T extends {}>(from: Query.Function<T>): SelectQuery<Query.Extract<T>>;

/**
 * Creates a new query.
 * 
 * If no selection is returned by the constructor, will return
 * the number of rows that would be selected or modified.
 */
function Query(from: Query.Function<void>): Query<number>;

function Query<T = void>(from: Query.Function<T>): Query | SelectQuery {
  const qb = new QueryBuilder(from);
  const send = (qb: QueryBuilder) => qb.connection.send(String(qb));

  async function get(limit?: number) {
    const self = qb.extend();

    if (limit)
      self.limit = limit;

    const res = await send(self);

    if (self.parse)
      return self.parse(res);

    return res;
  }

  async function one(orFail?: boolean) {
    const res = await get(1);

    if (res.length == 0 && orFail)
      throw new Error("Query returned no results.");

    return res[0] as T;
  }
  
  const runner: Query = {
    then: (resolve, reject) => get().then(resolve).catch(reject),
    count: () => send(qb.extend({ selects: undefined, parse: undefined })),
    toString: () => String(qb)
  }

  if(qb.selects)
    return { ...runner, get, one } as SelectQuery;

  return runner;
}

/**
   * Accepts instructions for nesting in a parenthesis.
   * When only one group of instructions is provided, the statement are separated by OR.
   */
function where(orWhere: Syntax[]): Syntax;

/**
 * Accepts instructions for nesting in a parenthesis.
 * 
 * When multiple groups of instructions are provided, the groups
 * are separated by OR and nested comparisons are separated by AND.
 */
function where(...orWhere: Syntax[][]): Syntax;

/**
 * Create a reference to the primary table, returned
 * object can be used to query against that table.
 */
function where<T extends Type>(entity: Type.EntityType<T>): Query.From<T>;

/**
 * Registers a type as a inner join.
 */
function where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join?: "inner"): Query.Join<T>;

/**
 * Registers a type as a left join, returned object has optional
 * properties which may be undefined where the join is not present.
 */
function where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join: Query.Join.Mode): Query.Join.Left<T>;

/**
 * Prepares write operations for a particular table.
 */
function where<T extends Type>(field: Query.From<T>): Query.Verbs<T>;

/**
 * Prepare comparison against a particilar field,
 * returns operations for the given type.
 */
function where<T extends Field>(field: T): Query.Asserts<T>;

function where(this: QueryBuilder, arg1: any, arg2?: any, arg3?: any): any {
  if(Type.is(arg1))
    return this.use(arg1, arg2, arg3);

  if(arg1 instanceof Field)
    return {
      ...arg1.compare(this.wheres),
      asc: () => { this.orderBy.set(arg1, "asc") },
      desc: () => { this.orderBy.set(arg1, "desc") }
    }
  
  if(Array.isArray(arg1)){
    const local = [] as Query.Compare[];
    const args = Array.from(arguments) as Syntax[][];

    for(const group of args){
      group.forEach(eq => this.wheres.delete(eq));

      if(arguments.length > 1)
        local.push(group);
      else
        local.push(...group);
    }

    this.wheres.add(local);

    return local;
  }

  const table = RelevantTable.get(arg1);

  if(!table)
    throw new Error(`Argument ${arg1} is not a query argument.`);

  return <Query.Verbs<Type>> {
    delete: () => {
      this.delete = table;
    },
    update: (data: Query.Update<any>) => {
      this.update = [table, data];
    }
  }
}

class QueryBuilder<T = unknown> {
  connection!: Connection;

  tables = [] as Query.Table[];
  pending = new Set<() => void>();
  parse?: (raw: any[]) => any[];
  template = "";

  delete?: Query.Table;
  update?: Readonly<[Query.Table, Query.Update<any>]>;
  selects: T;

  limit?: number;
  orderBy = new Map<Field, "asc" | "desc">();
  wheres = new Set<Query.Compare>();

  constructor(fn: Query.Function<T>){
    const context = where.bind(this) as Query.Where;

    context.is = where.bind(this);
    context.limit = (to: number) => { this.limit = to };

    assign(context, math());

    this.selects = fn(context);

    for (const fn of this.pending){
      this.pending.delete(fn);
      fn();
    }
  }

  public use<T extends Type>(type: Type.EntityType<T>): Query.From<T>
  public use<T extends Type>(type: Type.EntityType<T>, joinOn: Query.Join.On<T>, joinAs?: Query.Join.Mode): Query.Join<T>
  public use<T extends Type>(
    type: Type.EntityType<T>,
    joinOn?: Query.Join.On<T>,
    joinAs?: Query.Join.Mode){

    const { tables } = this;
    const { fields, schema } = type;

    let name: string = type.table;
    let alias: string | undefined;

    if(schema){
      alias = 'T' + tables.length;
      name = schema + '.' + name;
    }

    const proxy = {} as Query.From<T>;

    fields.forEach((field, key) => {
      let value: any;
      defineProperty(proxy, key, {
        get(){
          if(!value){
            const local = create(field) as typeof field;
            local.table = table;
            value = local.proxy ? local.proxy(table) : local; 
          }

          return value;
        }
      });
    });

    const table: Query.Table<T> = {
      alias,
      name,
      type,
      proxy,
      query: this,
      toString: () => alias || name
    };

    tables.push(table);
    RelevantTable.set(proxy, table);
    freeze(proxy);

    if(!this.connection)
      this.connection = type.connection || INERT;
    else if(type.connection !== this.connection)
      throw new Error(`Joined entity ${type} does not share a connection with main table ${tables[0]}.`);

    if(joinOn)
      this.join(table, joinOn, joinAs);
  
    return proxy;
  }

  public join<T extends Type>(
    table: Query.Table<T>,
    joinOn: Query.Join.On<T>,
    joinAs?: Query.Join.Mode){

    const { proxy, type } = table;
    const main = this.tables[0];
    
    if(typeof joinOn == "string")
      throw new Error("Bad parameters.");

    switch(joinAs){
      case undefined:
        joinAs = "inner";

      case "inner":
      case "left":
        break;

      case "right" as unknown:
      case "full" as unknown:
        throw new Error(`Cannot ${joinAs} join because that would affect ${main} which is already defined.`);

      default:
        throw new Error(`Invalid join type ${joinAs}.`);
    }
    
    const joinsOn = new Set<Syntax>();

    switch(typeof joinOn){
      case "object":
        for (const key in joinOn) {
          const left = (proxy as any)[key];
          const right = (joinOn as any)[key];
  
          if (left instanceof Field)
            joinsOn.add(sql(left, "=", right));
          else
            throw new Error(`${key} is not a valid column in ${type}.`);
        }
      break;

      case "function":
        this.pending.add(() => {
          joinOn(left => {
            if(left instanceof Field)
              return left.compare(joinsOn);

            throw new Error("Join assertions can only apply to fields.");
          });
        })
      break;

      default:
        throw new Error(`Invalid join on: ${joinOn}`);
    }

    table.join = {
      as: joinAs,
      on: joinsOn
    }
  }

  private toSelect(): {
    template: string;
    parse: (raw: any[]) => any[];
  } {
    const { selects } = this;
    const main = this.tables[0];

    if (selects instanceof Field)
      return {
        template: `SELECT ${selects} FROM ${main}`,
        parse: raw => raw.map(row => {
          return selects.get(row[selects.column])
        })
      }

    const columns = new Map<string, Field | Computed<unknown>>();
    
    function scan(obj: any, path?: string) {
      for (const key of getOwnPropertyNames(obj)) {
        const use = path ? `${path}.${key}` : key;
        const select = obj[key];

        if (select instanceof Field || select instanceof Computed)
          columns.set(use, select);
        else if (typeof select === 'object')
          scan(select, use);
      }
    }

    scan(selects);

    const selectClauses = Array.from(columns.entries())
      .map(([alias, field]) => `${field} AS \`${alias}\``)
      .join(', ');

    return {
      template: `SELECT ${selectClauses} FROM ${main}`,
      parse: raw => raw.map(row => {
        const values = {} as any;
        
        columns.forEach((field, column) => {
          const path = column.split('.');
          const prop = path.pop()!;
          let target = values;
  
          for (const step of path)
            target = target[step] || (target[step] = {});
  
          target[prop] = field.get(row[column]);
        });
  
        return values;
      })
    }
  }

  public toString() {
    const { limit, selects, tables } = this;
    let sql = '';

    if (this.delete) {
      sql = `DELETE FROM ${this.delete}`;
    }
    else if (this.update) {
      const [table, data] = this.update;
      const updates = table.type.digest(data);
      const sets = Object
        .entries(updates)
        .map(([col, val]) => `\`${col}\` = ${typeof val === 'string' ? `'${val}'` : val}`)
        .join(', ');

      sql = `UPDATE ${table} SET ${sets}`;
    }
    else if(selects){
      const { template, parse } = this.toSelect();
      this.parse = parse;
      sql = template;
    }
    else {
      let { alias, name } = tables[0];

      if(alias)
        name = `${name} AS ${alias}`;

      sql = `SELECT COUNT(*) FROM ${name}`;
    }

    for (const table of tables)
      if (table.join) {
        const { as, on } = table.join;
        const kind = as === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

        sql += ` ${kind} ${table} ON ${Array.from(on).join(' AND ')}`;
      }

    if (this.wheres.size) {
      function buildWhere(conditions: Query.Compare[], or?: boolean): string {
        return conditions.map(cond => {
          if(cond instanceof Syntax)
            return cond;

          if (Array.isArray(cond))
            return `(${buildWhere(cond, !or)})`;

          return "";
        }).filter(Boolean).join(or ? ' OR ' : ' AND ');
      }
  
      sql += ' WHERE ' + buildWhere(Array.from(this.wheres.values()));
    }
  
    if (this.orderBy.size)
      sql += ' ORDER BY ' + Array
        .from(this.orderBy)
        .map(([field, dir]) => `${field} ${dir}`)
        .join(', ')
  
    if (limit)
      sql += ` LIMIT ${limit}`;
  
    return sql;
  }

  extend(apply?: Partial<QueryBuilder>){
   return assign(create(this), apply) as QueryBuilder;
  }
}

export { Query, SelectQuery };