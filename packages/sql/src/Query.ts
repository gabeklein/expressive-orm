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

  type FieldOrValue<T> = T extends Field<infer U> ? U : T;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  namespace Join {
    type Mode = "left" | "inner";

    type Where = (field: Field) => {
      is(equalTo: Field): void;
      isNot(equalTo: Field): void;
      isMore(than: Field): void;
      isLess(than: Field): void;
    }

    type Function = (on: Where) => void;

    type On<T extends Type = any> = Function | { [K in Type.Fields<T>]?: T[K] };

    type Left<T extends Type> = Partial<From<T>>;
  }

  type Join<T extends Type> = From<T>;

  /** A query instruction returned by assertions which can be nested. */
  type Instruction = (or?: boolean) => void;

  /** A group of query instructions declared within parenthesis. */
  type Instructions  = Instruction[];

  type CompareValue<T> = T extends { get(): infer V } ? V : T;

  type Where = QueryBuilder["where"];

  interface Compare<T> {
    is(equalTo: T): Instruction;
    isNot(equalTo: T): Instruction;
    isMore(than: T): Instruction;
    isLess(than: T): Instruction;
  }

  interface Assert<T> extends Compare<T> {
    isAsc(): void;
    isDesc(): void;
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
  tables = [] as Query.Table[];
  pending = new Set<Query.Instruction>();
  parse?: (raw: any[]) => any[];

  constructor(fn: Query.Function<T>){
    this.commit(fn(this.where.bind(this)));
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
    
    const query = {
      then(resolve: (res: any) => any, reject: (err: any) => any){
        return get().then<T[]>(resolve).catch(reject);
      },
      count: () => this.builder.clone().clearSelect().count(),
      toString: () => this.builder.toString().replace(/```/g, "`")
    }
  
    if(this.parse)
      return {
        ...query,
        get,
        async one(orFail?: boolean){
          const res = await this.get(1);
      
          if(res.length == 0 && orFail)
            throw new Error("Query returned no results.");
      
          return res[0] as T;
        }
      }
  
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
  private where<T>(field: T): Query.Assert<Query.FieldOrValue<T>>;

  private where(type: any, on?: any, joinMode?: any){
    if(isTypeConstructor(type))
      return this.use(type, on, joinMode);

    if(Array.isArray(type))
      return this.andOr(...arguments)

    if(type instanceof Field)
      return {
        is: this.compare(type, "="),
        isNot: this.compare(type, "<>"),
        isMore: this.compare(type, ">"),
        isLess: this.compare(type, "<"),
        isAsc: this.orderBy(type, "asc"),
        isDesc: this.orderBy(type, "desc"),
      }

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
      
    const output = new Map<Field, string>();

    const scan = (obj: any, path?: string) => {
      for(const key of Object.getOwnPropertyNames(obj)){
        const select = obj[key];
        const use = path ? `${path}.${key}` : key;

        if(select instanceof Field){
          output.set(select, use);
          this.builder.select({ [use]: String(select) });
        }
        else if(typeof select == "object")
          scan(select, use);
      }
    };

    scan(selects);

    this.parse = raw => raw.map(row => {
      const values = {} as any;
    
      output.forEach((path, value) => {
        let target = values;
        const goto = path.split(".");
        const prop = goto.pop() as string;

        value = value.get(row[path]) as any;

        for(const path of goto)
          target = target[path] || (target[path] = {});

        target[prop] = value;
      })
        
      return values;
    })
  }

  andOr(...args: Query.Instructions[]){
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

  private compare(type: Field, op: string) {
    return (right: unknown) => {
      const apply = (or?: boolean) => {
        const r = typeof right === "number" ? right : String(right);
        this.builder[or ? "orWhere" : "where"](String(type), op, r);
      }

      this.pending.add(apply);

      return apply;
    };
  }

  private orderBy(field: Field, direction: "asc" | "desc"){
    return () => {
      this.builder.orderBy(String(field), direction);
    }
  }

  private use<T extends Type>(
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
      const engine = type.connection?.knex || knex({
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

            const on = (op: string) => (right: Field) => {
              table.on(String(field), op, String(right));
            };

            return {
              is: on("="),
              isNot: on("<>"),
              isMore: on(">"),
              isLess: on("<"),
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

export { Query, SelectQuery };