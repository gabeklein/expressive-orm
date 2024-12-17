import knex, { Knex } from 'knex';

import { Field } from './Field';
import { isTypeConstructor, Type } from './Type';
import { Computed, math, MathOps } from './math';

const RelevantTable = new WeakMap<{}, Query.Table>();

declare namespace Query { 
  interface Table<T extends Type = any> {
    type: Type.EntityType<T>;
    query: QueryBuilder;
    name: string | Knex.AliasDict;
    proxy: Query.From<T>;
    toString(): string;
  }

  type FieldOrValue<T> = T extends Value<infer U> ? U : T;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  namespace Join {
    type Mode = "left" | "inner";

    // TODO: does not chain like actual Compare
    type Where = (field: Field) => Compare<Field>;

    type Function = (on: Where) => void;

    type Equal<T extends Type = any> = { [K in Type.Fields<T>]?: T[K] };
    
    type On<T extends Type> = Function | Equal<T>;

    type Left<T extends Type> = Partial<From<T>>;
  }

  type Join<T extends Type> = From<T>;

  type Value<T = any> = T | Field<T> | Computed<T>;
  type ANumeric = Value<string | number>;
  type Numeric = Value<number>;

  type Where = 
    & QueryBuilder["where"]
    & MathOps
    & {
      is: QueryBuilder["where"];
      order: QueryBuilder["order"];
      limit: (to: number ) => void
    };

  interface Compare<T = any> {
    equal(value: Value<T>): symbol;
    not(value: Value<T>): symbol;
    more(than: Value<T>, orEqual?: boolean): symbol;
    less(than: Value<T>, orEqual?: boolean): symbol;
  }

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
  return new QueryBuilder(from).toRunner();
}

Query.one = function one<T extends {}>(
  where: Query.Function<T>, orFail?: boolean){

  return Query(where).one(orFail);
}

declare namespace Compare {
  type Op = { left: Field, op: string, right: unknown };
  type Recursive = Op | Recursive[] | undefined;
}

class QueryBuilder<T = unknown> {
  builder!: Knex.QueryBuilder;
  engine!: knex.Knex<any, unknown[]>;

  tables = [] as Query.Table[];
  pending = new Set<() => void>();
  parse?: (raw: any[]) => any[];

  limit?: number;
  orderBy = new Map<Field, "asc" | "desc">();
  wheres = new Map<symbol, Compare.Recursive>();

  constructor(fn: Query.Function<T>){
    const context = this.where.bind(this) as Query.Where;

    context.is = this.where.bind(this);
    context.order = this.order.bind(this);
    context.limit = (to: number) => { this.limit = to };

    Object.assign(context, math());

    this.commit(fn(context));
  }

  private init(main: Query.Table){
    const engine = this.engine = 
      main.type.connection?.knex || knex({
        client: "sqlite3",
        useNullAsDefault: true,
        pool: { max: 0 }
      });

    this.builder = engine(main.name);
  }

  /**
   * Accepts instructions for nesting in a parenthesis.
   * When only one group of instructions is provided, the statement are separated by OR.
   */
  private where(orWhere: symbol[]): symbol;

  /**
   * Accepts instructions for nesting in a parenthesis.
   * 
   * When multiple groups of instructions are provided, the groups
   * are separated by OR and nested comparisons are separated by AND.
   */
  private where(...orWhere: symbol[][]): symbol;

  /**
   * Create a reference to the primary table, returned
   * object can be used to query against that table.
   */
  private where<T extends Type>(entity: Type.EntityType<T>): Query.From<T>;

  /**
   * Registers a type as a inner join.
   */
  private where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join?: "inner"): Query.Join<T>;

  /**
   * Registers a type as a left join, returned object has optional
   * properties which may be undefined where the join is not present.
   */
  private where<T extends Type>(entity: Type.EntityType<T>, on: Query.Join.On<T>, join: Query.Join.Mode): Query.Join.Left<T>;

  /**
   * Prepares write operations for a particular table.
   */
  private where<T extends Type>(field: Query.From<T>): Query.Verbs<T>;

  /**
   * Prepare comparison against a particilar field,
   * returns operations for the given type.
   */
  private where<T>(field: T): Query.Compare<Query.FieldOrValue<T>>;

  private where(arg1: any, arg2?: any, arg3?: any): any {
    if(isTypeConstructor(arg1))
      return this.use(arg1, arg2, arg3);

    if(arg1 instanceof Field)
      return this.compare(arg1);

    if(Array.isArray(arg1))
      return this.andOr(...arguments)

    const table = RelevantTable.get(arg1);

    if(!table)
      throw new Error(`Argument ${arg1} is not a query argument.`);

    return <Query.Verbs<Type>> {
      delete: () => {
        this.builder.table(table.name).delete();
      },
      update: (data: Query.Update<any>) => {
        this.builder.table(table.name).update(table.type.digest(data));
      }
    }
  }

  private compare<T extends Field>(left: T): Query.Compare {
    const using = (operator: string) => {
      return (right: Query.Value<any>, orEqual?: boolean) => {
        const op = orEqual ? `${operator}=` : operator;
        
        const symbol = Symbol();
        this.wheres.set(symbol, { left, op, right });
        return symbol;
      }
    };

    return {
      equal: using("="),
      not: using("<>"),
      more: using(">"),
      less: using("<")
    };
  }

  private andOr(...args: symbol[][]){
    const symbol = Symbol();
    const wheres = [] as Compare.Recursive[];

    for(const group of args){
      const resolved = group.map(symbol => {
        const actual = this.wheres.get(symbol);
        this.wheres.delete(symbol);
        return actual;
      });

      if(args.length > 1)
        wheres.push(resolved);
      else
        wheres.push(...resolved);
    }

    this.wheres.set(symbol, wheres);

    return symbol;
  }

  private order(field: Field){
    return {
      asc: () => { this.orderBy.set(field, "asc") },
      desc: () => { this.orderBy.set(field, "desc") }
    }
  }

  private commit(selects: unknown){
    const apply = (
      compare: Iterable<Compare.Recursive>,
      builder: Knex.QueryBuilder<any, any>,
      or?: boolean) => {

      for(const clause of compare)
        if(clause)
          builder[or ? "orWhere" : "where"](
            Array.isArray(clause)
              ? (builder) => apply(clause, builder, !or)
              : this.raw(clause.left.compare(clause.op, clause.right))
          );
    }

    apply(this.wheres.values(), this.builder);

    this.pending.forEach(fn => fn());
    this.pending.clear();

    this.orderBy.forEach((order, field) => {
      this.builder.orderBy(`${field.table}.${field.column}`, order);
    });

    if(this.limit)
      this.builder.limit(this.limit);

    if(selects === undefined){
      this.builder.count();
      return;
    }

    if(selects instanceof Field){
      this.builder.select(this.raw(selects));
      this.parse = raw => raw.map(row => selects.get(row[selects.column]));
      return;
    }
    
    if(typeof selects != "object")
      throw new Error("Invalid selection.");
      
    const output = new Map<(data: any) => any, string>();

    const scan = (obj: any, path?: string) => {
      for(const key of Object.getOwnPropertyNames(obj)){
        const use = path ? `${path}.${key}` : key;
        const select = obj[key];

        if(select instanceof Field || select instanceof Computed){
          output.set(raw => select.get(raw), use);
          this.builder.select({ [use]: this.raw(select) });
        }
        else if(typeof select == "object")
          scan(select, use);
      }
    };

    scan(selects);

    this.parse = raw => raw.map(row => {
      const values = {} as any;
     
      output.forEach((column, value) => {
        const goto = column.split(".");
        const prop = goto.pop() as string;
        let target = values;

        for(const path of goto)
          target = target[path] || (target[path] = {});

        target[prop] = value(row[column]);
      })

      return values;
    })
  }

  private raw(sql: string | number | Field | Computed<unknown>){
    return this.engine.raw(
      typeof sql == "object" ? sql.toString() :
      typeof sql == "string" ? sql.replace(/'/g, "\\'") :
      sql
    );
  }

  toRunner(){
    const get = async (limit?: number) => {
      let execute = this.builder;
  
      if(limit)
        execute = execute.clone().limit(limit);
  
      if(this.parse)
        return execute.then(this.parse);
  
      return await execute;
    }

    const one = async (orFail?: boolean) => {
      const res = await get(1);
  
      if(res.length == 0 && orFail)
        throw new Error("Query returned no results.");
  
      return res[0] as T;
    }
    
    const query: Query = {
      then: (resolve, reject) => get().then(resolve).catch(reject),
      count: () => this.builder.clone().clearSelect().count(),
      toString: () => this.builder.toString().replace(/```/g, "`")
    }
  
    if(this.parse)
      return { ...query, get, one } as SelectQuery;
  
    return query;
  }

  use<T extends Type>(
    type: Type.EntityType<T>,
    joinOn: Query.Join.On<any>,
    joinMode?: Query.Join.Mode){

    const { tables } = this;
    let { fields, schema } = type;
    let name: string | Knex.AliasDict = type.table;
    let alias: string | undefined;

    if(schema){
      alias = `$${tables.length}`;
      name = { [alias]: schema + '.' + name };
    }

    const main = tables[0];
    const proxy = {} as Query.From<T>;
    const table: Query.Table<T> = {
      name,
      type,
      proxy,
      query: this,
      toString: () => alias || name as string
    };

    fields.forEach((field, key) => {
      let value: any;
      Object.defineProperty(proxy, key, {
        get(){
          if(!value)
            if(field.proxy)
              value = field.proxy(table);
            else {
              value = Object.create(field);
              value.table = alias || name as string;
            }

          return value;
        }
      });
    });

    tables.push(table);
    RelevantTable.set(proxy, table);
    Object.freeze(proxy);

    if(!main)
      this.init(table);
    else if(typeof joinOn == "string")
      throw new Error("Bad parameters.");
    else if(type.connection !== main.type.connection)
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}`);
    else {
      let callback: Knex.JoinCallback;

      if (typeof joinOn == "object")
        callback = (table) => {
          for (const key in joinOn) {
            const field = (proxy as any)[key];
    
            if (field instanceof Field)
              table.on(String(field), "=", String(joinOn[key]));
            else
              throw new Error(`${key} is not a valid column in ${type}.`);
          }
        }
      else if (typeof joinOn == "function")
        callback = (table) => {
          this.pending.add(() => {
            joinOn(field => {
              if (!(field instanceof Field))
                throw new Error("Join assertions can only apply to fields.");

              const on = (operator: string) => (right: Field, orEqual?: boolean): any => {
                const op = orEqual ? `${operator}=` : operator;
                table.on(this.raw(field.compare(op, right)));
              };

              return {
                equal: on("="),
                not: on("<>"),
                more: on(">"),
                less: on("<"),
              }
            });
          })
        }
      else
        throw new Error(`Invalid join on: ${joinOn}`);

      switch(joinMode){
        case undefined:
        case "inner":
          this.builder.join(name, callback);
          break;

        case "left":
          this.builder.leftJoin(name, callback);
          break;

        case "right" as unknown:
        case "full" as unknown:
          throw new Error(`Cannot ${joinMode} join because that would affect ${this.tables[0]} which is already defined.`);

        default:
          throw new Error(`Invalid join type ${joinMode}.`);
      }
    }
  
    return proxy;
  }
}

export { Query, SelectQuery };