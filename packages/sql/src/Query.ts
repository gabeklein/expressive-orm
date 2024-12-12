import knex, { Knex } from 'knex';

import { Field } from './Field';
import { digest, isTypeConstructor, Type } from './Type';

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

  /** A query instruction returned by assertions which can be nested. */
  type Instruction = (or?: boolean) => void;

  /** A group of query instructions declared within parenthesis. */
  type Instructions  = Instruction[];

  type Value<T = any> = T | Field<T> | Computed<T>;
  type ANumeric = Value<string | number>;
  type Numeric = Value<number>;

  type Where = 
    & QueryBuilder["where"]
    & ReturnType<QueryBuilder["math"]>
    & {
      is: QueryBuilder["where"];
      order: QueryBuilder["order"];
    };

  interface Compare<T = any> {
    equal(value: Value<T>): Instruction;
    not(value: Value<T>): Instruction;
    more(than: Value<T>, orEqual?: boolean): Instruction;
    less(than: Value<T>, orEqual?: boolean): Instruction;
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

class QueryBuilder<T = unknown> {
  builder!: Knex.QueryBuilder;
  engine!: knex.Knex<any, unknown[]>;

  tables = [] as Query.Table[];
  pending = new Set<Query.Instruction>();
  parse?: (raw: any[]) => any[];

  constructor(fn: Query.Function<T>){
    const context = this.where.bind(this) as Query.Where;

    context.order = this.order.bind(this);
    context.is = this.where.bind(this);

    Object.assign(context, this.math());

    this.commit(fn(context));
  }

  raw(sql: string | Field | Computed<unknown>){
    return typeof sql == "string" ? sql : this.engine.raw(sql.toString());
  }

  private math(){
    type Value = Query.Value;
    type ANumeric = Query.ANumeric;
    type Numeric = Query.Numeric;

    function op(op: string, rank: number, unary: true): (value: Value) => Value;
    function op(op: string, rank: number, unary?: false): (left: Value, right: Value) => Value;
    function op(op: string, rank: number, arg2?: boolean){
      return (l: any, r?: any) => {
        const input = arg2 === true ? [op, l] : [l, op, r]
        const computed = new Computed(...input);

        computed.rank = rank || 0;

        return computed;
      }
    }

    type MathOps = {
      add(left: Numeric, right: Numeric): Numeric;
      add(left: ANumeric, right: ANumeric): ANumeric;
      sub(left: Numeric, right: Numeric): Numeric;
      mul(left: Numeric, right: Numeric): Numeric;
      div(left: Numeric, right: Numeric): Numeric;
      mod(left: Numeric, right: Numeric): Numeric;
      neg(value: Numeric): Numeric;
      bit: {
        not(value: Numeric): Numeric;
        and(left: Numeric, right: Numeric): Numeric;
        or(left: Numeric, right: Numeric): Numeric;
        xor(left: Numeric, right: Numeric): Numeric;
        left(value: Numeric, shift: Numeric): Numeric;
        right(value: Numeric, shift: Numeric): Numeric;
      }
    }

    return <MathOps> {
      add: op('+', 4),
      sub: op('-', 4),
      mul: op('*', 5),
      div: op('/', 5),
      mod: op('%,', 5),
      neg: op('-', 7, true),
      pos: op('+', 7, true),
      bit: {
        not: op('~', 6, true),
        left: op('<<', 3),
        right: op('>>', 3),
        and: op('&', 2),
        or: op('|', 0),
        xor: op('^', 1),
      }
    }
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

  /**
   * Accepts instructions for nesting in a parenthesis.
   * When only one group of instructions is provided, the statement are separated by OR.
   */
  private where(orWhere: Query.Instructions): Query.Instruction;

  /**
   * Accepts instructions for nesting in a parenthesis.
   * 
   * When multiple groups of instructions are provided, the groups
   * are separated by OR and nested comparisons are separated by AND.
   */
  private where(...orWhere: Query.Instructions[]): Query.Instruction;

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

  private where(type: any, on?: any, joinMode?: any){
    if(isTypeConstructor(type))
      return this.use(type, on, joinMode);

    if(Array.isArray(type))
      return this.andOr(...arguments)

    if(type instanceof Field)
      return  this.compare(type);

    const table = RelevantTable.get(type);

    if(!table)
      throw new Error(`Argument ${type} is not a query argument.`);

    return <Query.Verbs<Type>> {
      delete: () => {
        this.builder.table(table.name).delete();
      },
      update: (data: Query.Update<any>) => {
        data = digest.call(table.type, data);
        this.builder.table(table.name).update(data);
      }
    }
  }

  private commit(selects: unknown){
    this.pending.forEach(fn => fn());
    this.pending.clear();

    if(selects === undefined){
      this.builder.count();
      return;
    }

    if(selects instanceof Field){
      const name = selects.column;
  
      this.builder.select({ [name]: String(selects) });
      this.parse = raw => raw.map(({ [name]: value }) => (
        selects.get ? selects.get(value) : value
      ));

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

  private andOr(...args: Query.Instructions[]){
    for(const group of args)
      for(const fn of group)
        this.pending.delete(fn);

    const apply = () => {
      const orGroup = args.length > 1;
      const current = this.builder;

      args.forEach((group, i) => {
        this.builder[i > 0 ? "orWhere" : "where"](context => {
          this.builder = context;
          group.forEach(fn => fn(!orGroup));
          this.builder = current;
        })
      });
    }

    this.pending.add(apply);

    return apply;
  }

  private compare<T extends Field>(type: T): Query.Compare {
    const ref = String(type);
    const using = (operator: string) => (right: Query.Value<any>, orEqual?: boolean) => {
      const apply = (or?: boolean) => {
        const op = orEqual ? `${operator}=` : operator;
        // TODO: this should incorperate field.set
        const r = typeof right == "number" ? right : this.raw(right);
        this.builder[or ? "orWhere" : "where"](ref, op, r);
      }

      this.pending.add(apply);

      return apply;
    };

    return {
      equal: using("="),
      not: using("<>"),
      more: using(">"),
      less: using("<")
    };
  }

  private order(field: Field){
    return {
      asc: () => this.builder.orderBy(String(field), "asc"),
      desc: () => this.builder.orderBy(String(field), "desc")
    }
  }

  use<T extends Type>(
    type: Type.EntityType<T>,
    joinOn: Query.Join.On<any>,
    joinMode?: Query.Join.Mode){

    const { tables } = this;
    let { fields, schema } = type;
    let name: string | Knex.AliasDict = type.table
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
      toString(){
        return alias || name as string;
      },
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
              value.toString = () => `${table}.${field.column}`;
            }

          return value;
        }
      });
    });

    tables.push(table);
    RelevantTable.set(proxy, table);
    Object.freeze(proxy);

    if(!main){
      const engine = this.engine = type.connection?.knex || knex({
        client: "sqlite3",
        useNullAsDefault: true,
        pool: { max: 0 }
      });

      this.builder = engine(name)
    }
    else if(typeof joinOn == "string")
      throw new Error("Bad parameters.");
    else if(type.connection !== main.type.connection)
      throw new Error(`Joined entity ${type} does not share a connection with main table ${main}`);
    else
      this.join(table, joinOn, joinMode);
  
    return proxy;
  }

  private join(
    table: Query.Table,
    joinOn: Query.Join.On<any>,
    joinMode?: Query.Join.Mode){

    const { name, type } = table;
    let callback: Knex.JoinCallback;

    if (typeof joinOn === "function")
      callback = (table) => {
        this.pending.add(() => {
          joinOn(field => {
            if (!(field instanceof Field))
              throw new Error("Join assertions can only apply to fields.");

            const on = (operator: string) => (right: Field, orEqual?: boolean): any => {
              const op = orEqual ? `${operator}=` : operator;
              table.on(String(field), op, String(right));
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
    else if (typeof joinOn === "object")
      callback = (table) => {
        for (const key in joinOn) {
          const field = type.fields.get(key);
  
          if (field instanceof Field)
            table.on(String(field), "=", String(joinOn[key]));
          else
            throw new Error(`${key} is not a valid column in ${type}.`);
        }
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
}

class Computed<T> extends Array<T | Field<T> | Computed<T>> {
  rank = 0;

  get(input: unknown){
    return input as string;
  }
  
  toString(): string {
    return this.map(value => {
      if(typeof value == "number")
        return value;

      if(value instanceof Computed)
        return value.rank > this.rank ? value : `(${value})`;

      return String(value);
    }).join(" ");
  }
}

export { Query, SelectQuery };