import { Field, Type } from '..';
import { assign, create } from '../utils';
import { Group, Builder as QB } from './Builder';
import { Computed } from './Computed';

declare namespace Query {
  /** Internal state for this Query. */
  type Builder = QB;

  type Join<T extends Type> = From<T>;

  type Table = QB.Table;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Optional<T extends Type = Type> = {
    [K in Type.Fields<T>]?: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Update<T extends Type> = { [K in Type.Fields<T>]?: Updates<T[K]> };

  type FromData<T extends {}> = { [K in keyof T]: Field<T[K]> };

  type Value<T = any> = T | Field<T> | Computed<T>

  type Where = typeof where & { name: string };

  type Updates<T> = Field.Updates<T> | T | Field;

  type Function<R> = (this: Builder, where: Where) => R;

  type FunctionFrom<T extends {}, R> = (this: Builder, where: Where, data: FromData<T>) => R;

  type Factory<R, A extends any[]> = (this: Builder, where: Where) => (...args: A) => R;
  
  interface Template<A extends any[]> {
    (...args: A): Query;

    /** Prepared query for this template. */
    toString(): string;
  }

  type TemplateSelects<T, A extends any[]> = (...args: A) => Selects<T>;

  type Extract<T> =
    T extends Field.Returns<infer R> ? R :
    T extends From<infer U> ? { [J in Type.Fields<U>]: Extract<U[J]> } :
    T extends {} ? { [K in keyof T]: Extract<T[K]> } :
    T;

  type Asserts<T extends Field> = ReturnType<T["where"]> & {
    asc(): void;
    desc(): void;
  };

  interface Verbs <T extends Type> {
    delete(): void;
    update(values: Query.Update<T>): void;
  }
  
  interface Selects<T> extends Query<Extract<T>[]> {
    /**
     * Returns rows which match creteria.
     */
    get(): Promise<Extract<T>[]>;
  
    /**
     * Returns the first row that matches creteria.
     * 
     * @param orFail If true, will throw an error if no match is found.
     */
    one(orFail?: boolean): Promise<Extract<T>>;
  }
}

interface Query<T = number> extends PromiseLike<T> {
  /** Returns the SQL string prepared by this query. */
  toString(): string;

  /**
   * Processed inputs which will be sent with SQL for this query.
   * Data has already been serialized and ordered to match `?` in template.
   */
  params: (string | number)[];
}

function Query<T extends {}, A extends unknown[]>(from: Query.Factory<T, A>): Query.TemplateSelects<T, A>;

function Query<A extends unknown[]>(from: Query.Factory<void, A>): Query.Template<A>;

function Query<T extends {}>(from: Query.Function<T>): Query.Selects<T>;

/**
 * Creates a new query.
 * Will return the number of rows that would be selected or modified.
 */
function Query(from: Query.Function<void>): Query;

function Query(factory: Query.Function<unknown> | Query.Factory<unknown, any[]>){
  const builder = new QB();
  let result = factory.call(builder, where.bind(builder));
  let args: number | undefined;

  if(typeof result === 'function'){
    const params = builder.inject(args = result.length);
    result = (result as Function)(...params);
  }

  type Q = Query<any>;

  const template = builder.commit(result);
  const statement = builder.connection.prepare(template);
  const toString = () => statement.toString();
  const runner = (...params: any[]) => { 
    params = builder.accept(params);
    
    const get = () => statement.all(params).then(a => a.map(x => builder.parse(x)));
    const query = create(Query.prototype) as Q;
    
    assign(query, {
      params,
      toString,
      get template(){
        return toString();
      },
      then(resolve, reject){
        const run = builder.selects ? get() : statement.run(params);
        return run.then(resolve).catch(reject);
      }
    } as Q);

    if (builder.selects)
      assign(query, {
        get,
        one: async (orFail?: boolean) => {
          const res = await statement.get();

          if(res)
            return builder.parse(res);

          if (orFail)
            throw new Error("Query returned no results.");
        }
      });

    return query;
  };

  if(typeof args == "number"){
    runner.toString = toString;
    return runner;
  }

  return runner();
}

function from<I extends {}, O extends {}>(data: Iterable<I>, query: Query.FunctionFrom<I, O>): Query.Selects<O>;

function from<I extends {}>(data: Iterable<I>, query: Query.FunctionFrom<I, void>): Query;

function from<I extends {}>(data: Iterable<I>, query: Query.FunctionFrom<I, any>): any {
  return Query(function(where){
    return query.call(this, where, where(data));
  })
}

Query.from = from;
Query.Builder = QB;

/**
 * Create a reference to the primary table, returned
 * object can be used to query against that table.
 */
function where<T extends Type>(entity: Type.EntityType<T>, optional?: false): Query.From<T>;

/**
 * Registers a type as a left join, returned object has optional
 * properties which may be undefined where the join is not present.
 */
function where<T extends Type>(entity: Type.EntityType<T>, optional?: boolean): Query.Optional<T>;

/**
 * Select a table for comparison or write operations.
 */
function where<T extends Type>(field: Query.From<T> | Query.Join<T>): Query.Verbs<T>;

/**
 * Prepare comparison against a particilar field,
 * returns operations for the given type.
 */
function where<T extends Field>(field: T | undefined): Query.Asserts<T>;

function where<T extends {}>(data: Iterable<T>): { [K in keyof T]: Field<T[K]> };

/**
 * Accepts other where() assertions for nesting in parenthesis.
 * 
 * Will alternate between AND-OR depending on depth, starting with OR.
 */
function where(...orWhere: (string | Group)[]): Group;

/** Specify the limit of results returned. */
function where(limit: number): void;

function where(this: QB, arg1: any, arg2?: any, arg3?: any): any {
  if(arg1 instanceof Field)
    return this.field(arg1);

  if(Type.is(arg1))
    return this.use(arg1, arg2);

  if(this.tables.has(arg1))
    return this.table(arg1);

  if(typeof arg1 == "string" || arg1 instanceof Group)
    return this.andOr(...arguments);

  if(typeof arg1 == "number"){
    this.limit = arg1;
    return;
  }

  if(Symbol.iterator in arg1) 
    return this.with(arg1);

  throw new Error(`Argument ${arg1} is not a query argument.`);
}

export { Query };