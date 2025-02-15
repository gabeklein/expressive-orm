import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Type } from '../type/Type';
import { assign, create, defineProperty } from '../utils';
import { Builder as QB, Cond, Group, Builder } from './Builder';
import { Computed } from './Computed';

declare namespace Query {
  type Table = QB.Table;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Join<T extends Type = Type> = {
    [K in Type.Fields<T>]?: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Update<T extends Type> = { [K in Type.Fields<T>]?: Updates<T[K]> };

  type FromData<T extends {}> = { [K in keyof T]: Field<T[K]> };

  type Value<T = any> = T | Field<T> | Computed<T>

  type Insert<T extends Type> = 
    & { [K in Type.Required<T>]: Field.Assigns<T[K]> | Field; }
    & { [K in Type.Fields<T>]?: Field.Assigns<T[K]> | Field } 

  /** Main callback for adding instructions to a Query. */
  type Where = {
    /**
     * Declare inserts to be made into a given table.
     */
    <T extends Type>(entity: Type.EntityType<T>, ...inserts: Insert<T>[]): From<T>;

    /**
     * Create a reference to the primary table, returned
     * object can be used to query against that table.
     */
    <T extends Type>(entity: Type.EntityType<T>): From<T>;

    /**
     * Registers a type as a left join, returned object has optional
     * properties which may be undefined where the join is not present.
     */
    <T extends Type>(entity: Type.EntityType<T>, optional: true): Join<T>;

    /**
     * Select a table for comparison or write operations.
     */
    <T extends Type>(field: From<T> | Join<T>): Verbs<T>;

    /**
     * Prepare comparison against a particilar field,
     * returns operations for the given type.
     */
    <T extends Field>(field: T | undefined): Asserts<T>;

    <T extends {}>(data: Iterable<T>): { [K in keyof T]: Field<T[K]> };

    /**
     * Accepts other where() assertions for nesting in parenthesis.
     * 
     * Will alternate between AND-OR depending on depth, starting with OR.
     */
    (...orWhere: (Cond | Group)[]): Group;

    /** Specify the limit of results returned. */
    (limit: number): void;

    connection: Connection.Ready;
  }

  type Updates<T> = Field.Updates<T> | T | Field;

  type Function<R> = (this: Builder, where: Where) => R;

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
    update(values: Update<T>): void;
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

interface Query<T = any> extends PromiseLike<T> {
  /** Returns the SQL string prepared by this query. */
  toString(): string;

  /**
   * Inputs to be sent with SQL for this query.
   * Data has already been serialized and matched to query parameters in template.
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
function Query(from: Query.Function<void>): Query<number>;

function Query(factory: Query.Function<unknown> | Query.Factory<unknown, any[]>){
  let connection: Connection | undefined = undefined;
  
  function where(arg1: any): any {
    if(Type.is(arg1)){
      if(!connection)
        connection = arg1.connection;
      else if(connection !== arg1.connection)
        throw new Error(
          `Joined entity ${arg1} does not share a connection with other tables in Query.`
        );
      
      return builder.use(arg1, ...Array.from(arguments).slice(1));
    }

    if(arg1 instanceof Field)
      return builder.field(arg1);

    if(builder.tables.has(arg1))
      return builder.table(arg1);
  
    if(arg1 instanceof Cond || arg1 instanceof Group)
      return builder.andOr(...arguments);
  
    if(typeof arg1 == "number"){
      builder.limit = arg1;
      return;
    }
  
    if(Symbol.iterator in arg1) 
      return builder.with(arg1);
  
    throw new Error(`Argument ${arg1} is not a query argument.`);
  }

  defineProperty(where, "connection", {
    get(){ return connection },
    set(conn){ connection = conn }
  })

  const builder = new QB();
  let result = factory.call(builder, where as Query.Where);
  let args: number | undefined;

  if(typeof result === 'function'){
    const params = builder.inject(args = result.length);
    result = (result as Function)(...params);
  }

  builder.commit(result);

  if(!connection)
    connection = Connection.None;

  const template = connection.generate(builder);
  const statement = connection.prepare(template);
  const runner = (...params: any[]) => { 
    const get = () => statement.all(params).then(a => a.map(x => builder.parse(x)));
    const query = create(Query.prototype) as Query;

    params = builder.accept(params);
    
    assign(query, <Query>{
      params,
      toString: statement.toString,
      then(resolve, reject){
        const run = builder.returns ? get() : statement.run(params);
        return run.then(resolve).catch(reject);
      }
    });

    if (builder.returns)
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
    runner.toString = statement.toString;
    return runner;
  }

  return runner();
}

Query.Builder = QB;

export { Query };