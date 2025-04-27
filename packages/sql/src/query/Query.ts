import { Connection } from '../connection/Connection';
import { Field } from '../type/Field';
import { Table } from '../type/Table';
import { assign, create, defineProperty } from '../utils';
import { Builder as QB, Builder, Cond, Expression, Group, QueryTemplate } from './Builder';
import { BitWise, Computed, MathOps } from './Computed';
import { Cond, Expression, Group, QueryTemplate } from './Value';

declare namespace Query {
  type ITable = QB.ITable;

  type From<T extends Table = Table> = {
    [K in Table.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Join<T extends Table = Table> = {
    [K in Table.Fields<T>]?: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Update<T extends Table> = { [K in Table.Fields<T>]?: Updates<T[K]> };

  type FromData<T extends {}> = { [K in keyof T]: Field<T[K]> };

  type Match<T = any> = T | (T extends Field<infer U> ? Match<U> : Field<T> | Computed<T>);

  type Insert<T extends Table> = 
    & { [K in Table.Required<T>]: Field.Assigns<T[K]> | Field; }
    & { [K in Table.Fields<T>]?: Field.Assigns<T[K]> | Field };

  interface Functions extends MathOps {
    (template: string): QueryTemplate;
    bit: BitWise;
  }

  /** Main callback for adding instructions to a Query. */
  type Where = {
    /** Specify the limit of results returned. */
    (limit: number): void;

    /** Evaluate an expression */
    (template: string): Compare<Field<unknown>>;

    /**
     * Accepts other where() assertions for nesting in parenthesis.
     * 
     * Will alternate between AND-OR depending on depth, starting with OR.
     */
    (...orWhere: Expression[]): Group;

    /**
     * Declare inserts to be made into a given table.
     */
    <T extends Table>(entity: Table.Type<T>, ...inserts: Insert<T>[]): From<T>;

    /**
     * Create a reference to the primary table, returned
     * object can be used to query against that table.
     */
    <T extends Table>(entity: Table.Type<T>): From<T>;

    /**
     * Registers a type as a left join, returned object has optional
     * properties which may be undefined where the join is not present.
     */
    <T extends Table>(entity: Table.Type<T>, optional: true): Join<T>;

    /**
     * Select a table for comparison or write operations.
     */
    <T extends Table>(field: From<T> | Join<T>): Verbs<T>;

    /**
     * Prepare comparison against a particilar field,
     * returns operations for the given type.
     */
    <T extends Field>(field: T | undefined): Asserts<T>;

    <T extends {}>(data: Iterable<T>): { [K in keyof T]: Field<T[K]> };

    connection: Connection.Ready;
  }

  type Compare<T> = {
    equal(value: Match<T>): Expression;
    not(value: Match<T>): Expression;
    over(value: Match<T>, orEqual?: boolean): Expression;
    under(value: Match<T>, orEqual?: boolean): Expression;
    in(value: Match<T>[]): Expression;
  }

  type Asserts<T extends Field> = Compare<T> & {
    asc(): void;
    desc(): void;
  };

  type Updates<T> = Field.Updates<T> | T | Field;

  type Function<R> = (this: Builder, where: Where, fn: Functions) => R;

  type Factory<R, A extends any[]> = Function<(...args: A) => R>;
  
  type Template<A extends any[]>  = (...args: A) => Query;

  type TemplateSelects<T, A extends any[]> = (...args: A) => Selects<T>;

  type Returns<T> =
    T extends Field.Returns<infer R> ? R :
    T extends From<infer U> ? { [J in Table.Fields<U>]: Returns<U[J]> } :
    T extends {} ? { [K in keyof T]: Returns<T[K]> } :
    T;

  interface Verbs <T extends Table> {
    delete(): void;
    update(values: Update<T>): void;
  }
  
  interface Selects<T> extends Query<Returns<T>[]> {
    /**
     * Returns rows which match creteria.
     */
    get(): Promise<Returns<T>[]>;
  
    /**
     * Returns the first row that matches creteria.
     * 
     * @param orFail If true, will throw an error if no match is found.
     */
    one(orFail?: boolean): Promise<Returns<T>>;
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
    if(Table.is(arg1)){
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

    if(typeof arg1 == "string")
      return new QueryTemplate(arg1, builder) ;
  
    if(Symbol.iterator in arg1) 
      return builder.with(arg1);
  
    throw new Error(`Argument ${arg1} is not a query argument.`);
  }

  function runner(...params: any[]) {
    const get = () => statement.all(params).then(a => a.map(x => builder.parse(x)));
    const query = create(Query.prototype) as Query;

    params = builder.accept(params);

    assign(query, <Query>{
      params,
      toString: statement.toString,
      then(resolve, reject) {
        const run = builder.returns ? get() : statement.run(params);
        return run.then(resolve).catch(reject);
      }
    });

    if (builder.returns)
      assign(query, {
        get,
        async one(orFail?: boolean) {
          const res = await statement.get();

          if (res)
            return builder.parse(res);

          if (orFail)
            throw new Error("Query returned no results.");
        }
      });

    return query;
  }

  defineProperty(where, "connection", {
    get: () => connection,
    set(conn){ connection = conn }
  })

  const builder = new QB();
  const func: Query.Functions | undefined = factory.length > 1
    ? assign((template: string) => new QueryTemplate(template, builder), Query.fn)
    : undefined;

  let result = factory.call(builder, where as Query.Where, func!);
  let args: number | undefined;

  if(typeof result === 'function'){
    const params = builder.inject(args = result.length);
    result = (result as Function)(...params);
  }

  builder.commit(result);

  if(!connection)
    connection = Connection.None;

  const statement = connection.prepare(builder);

  if(typeof args == "number"){
    runner.toString = statement.toString;
    return runner;
  }

  return runner();
}

Query.Builder = QB;
Query.fn = { ...MathOps, bit: BitWise } as Query.Functions;

export { Query };