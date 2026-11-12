import { Field, type Omits } from '../Field';
import type { Rows } from '../rows';
import type { Type } from '../Type';
import { Builder } from './Builder';
import { BitWise, Computed, MathOps } from './Computed';
import { Cond, Expression, Group, type Moment, QueryTemplate } from './Value';

declare const ENTITY: unique symbol;

declare namespace Query {
  const Builder: typeof import('./Builder').Builder;

  type ITable = Builder.ITable;

  /** A class usable as a query table - an entity class. */
  type Table<T = any> = (abstract new (...args: any[]) => T) & {
    fields: Map<string, Field>;
    table: string;
    schema?: string;
    connection?: Type.Connection;
  };

  type Members<T> = {
    [K in keyof T]: T[K] extends Type.Class | Rows<any, any> | ((...args: any[]) => any) ? never : K
  }[keyof T];

  type Keys<T> = Exclude<Members<T>, Exclude<keyof Type, "id">>;

  type Column<V> =
    [NonNullable<V>] extends [Type]
      ? undefined extends V ? Join<NonNullable<V>> : From<NonNullable<V>>
      : Field<V>;

  /** A table's columns inside a query - a relation property is its joined table. */
  type From<T = any> = { [K in Keys<T>]: Column<T[K]> } & { readonly [ENTITY]: T };

  /** A left-joined table's columns - each may be absent. */
  type Join<T = any> = { [K in Keys<T>]?: Column<T[K]> } & { readonly [ENTITY]: T };

  type Value<V> = Field<V | undefined> | Computed<V>;

  /**
   * A value to compare against - a literal, a column, an expression or `now`.
   *
   * `null` is accepted for a nullable column.
   */
  type Match<V = any> = V | Value<NonNullable<V>> | Moment<V> | (undefined extends V ? null : never);

  type Assigns<V> =
    [NonNullable<V>] extends [Type]
      ? NonNullable<V> | Type.Columns<Extract<NonNullable<V>, Type>> | NonNullable<V>["id"] | From<NonNullable<V>> | Value<NonNullable<V>["id"]>
      : V | Value<NonNullable<V>> | Moment<V>;

  type Writable<T> = Exclude<Keys<T>, "id">;

  type Insert<T> =
    & { [K in Keys<T> as Omits<T[K]> extends true ? never : K]: Assigns<T[K]> }
    & { [K in Keys<T> as Omits<T[K]> extends true ? K : never]?: Assigns<T[K]> | (undefined extends T[K] ? null : never) };

  type Update<T> = {
    [K in Writable<T>]?: Assigns<T[K]> | (undefined extends T[K] ? null : never)
  };

  type Matching<T> = {
    [K in Writable<T>]?: Assigns<T[K]> | (undefined extends T[K] ? null : never)
  };

  type FromData<T extends {}> = { [K in keyof T]: Field<T[K]> };

  /** Math helpers, a `Query` function's second argument - called with a string, it embeds raw SQL. */
  interface Functions extends MathOps {
    (template: string): QueryTemplate;
    /** Bitwise operators. */
    bit: BitWise;
  }

  /**
   * A `Query` function's first argument - adds tables, conditions, writes and limits.
   *
   * What a call does depends on what it is given.
   */
  interface Where {
    /** Limit the rows selected. */
    (limit: number): void;
    /** Embed raw SQL as a value. Not supported by `Memory.new()`. */
    (template: string): QueryTemplate;
    /** Group conditions with OR. A group inside a group alternates to AND. */
    (...orWhere: Expression[]): Group;
    /** Left join a table - a row is kept when nothing matches. */
    <T>(entity: Table<T>, optional: true): Join<T>;
    /**
     * Add a table, returning its columns.
     *
     * On SQL each table after the first needs a condition against another's column.
     */
    <T>(entity: Table<T>): From<T>;
    /** Insert rows into a table. A value may be another table's column, inserting once per matched row. */
    <T>(entity: Table<T>, ...inserts: Insert<T>[]): From<T>;
    /** Write to a table in the query - `update`, `delete`, or `match` its columns. */
    <T>(field: From<T> | Join<T>): Verbs<T>;
    /** Compare or order by a column. */
    <V>(field: Field<V> | undefined): Asserts<V>;
    /** Use in-memory rows as a table, to join against or insert from. */
    <T extends {}>(data: Iterable<T>): FromData<T>;
    /** The connection the query runs on - taken from its first table; every table must share it. */
    connection: Type.Connection | undefined;
  }

  /** Comparisons on a column. Each returns its condition, to group with `where(a, b)`. */
  interface Compare<V> {
    /** Equal to `value`; `null` matches a missing value on a nullable column. */
    equal(value: Match<V>): Expression;
    /** Not equal to `value`; `null` matches any present value. */
    not(value: Match<V>): Expression;
    /** Greater than `value` - or equal, with `orEqual`. */
    over(value: Match<V>, orEqual?: boolean): Expression;
    /** Less than `value` - or equal, with `orEqual`. */
    under(value: Match<V>, orEqual?: boolean): Expression;
    /** Any of `value`. An empty list matches nothing. */
    in(value: Match<V>[]): Expression;
  }

  type Asserts<V> = Compare<V> & {
    asc(): void;
    desc(): void;
  };

  type Function<R> = (this: Builder, where: Where, fn: Functions) => R;

  type Factory<R, A extends any[]> = Function<(...args: A) => R>;

  type Template<A extends any[]> = (...args: A) => Query;

  type TemplateSelects<T, A extends any[]> = (...args: A) => Selects<T>;

  type Returns<T> =
    T extends Field<infer V> ? V :
    T extends Computed<infer V> ? V :
    T extends { readonly [ENTITY]: infer U } ? Nested<T, U> :
    T extends {} ? { [K in keyof T]: Returns<T[K]> } :
    T;

  type Nested<T, U> =
    U extends Type ? T extends From<U> ? Type.Columns<U> : Type.Columns<U> | undefined :
    { [K in Exclude<keyof T, typeof ENTITY>]: Returns<T[K]> };

  type Row<T> =
    T extends { readonly [ENTITY]: infer U } ? U extends Type ? Type.Columns<U> : U :
    Returns<T>;

  /** Writes on a table in a query. */
  interface Verbs<T> {
    /** Delete the matched rows. */
    delete(): void;
    /** Assign columns on the matched rows. `undefined` values are skipped. A fixed column is still written. */
    update(values: Update<T>): void;
    /** Add an `equal` condition per key. `undefined` values are skipped. */
    match(values: Matching<T>): void;
  }

  /** A query with a selection. */
  interface Selects<T> extends Query<Row<T>[]> {
    /** Run the query, resolving its rows - what awaiting it does. */
    get(): Promise<Row<T>[]>;

    /** Run the query, resolving the first row; throws when there is none. */
    one(orFail: true): Promise<Row<T>>;
    /** Run the query, resolving the first row or `undefined`. */
    one(orFail?: boolean): Promise<Row<T> | undefined>;
  }
}

/** A built query - a Promise that runs each time it is awaited. */
interface Query<T = any> extends Promise<T> {
  /** The statement as its connection renders it - SQL, or an outline without one. */
  toString(): string;

  /** Values bound to the statement's parameters. */
  params: unknown[];
}

/**
 * Build a query template - a function of parameters, compiled once.
 *
 * It selects what the inner function returns.
 *
 * Inside it the arguments are placeholders - compare with them, don't branch on them.
 *
 * @example
 * class User extends Type { name = str() }
 *
 * const byName = Query(where => (name: string) => {
 *   const user = where(User);
 *   where(user.name).equal(name);
 *   return user;
 * });
 * const [ann] = await byName("Ann");
 */
function Query<T extends {}, A extends unknown[]>(from: Query.Factory<T, A>): Query.TemplateSelects<T, A>;

/** Build a write or count template - a function of parameters resolving a number. */
function Query<A extends unknown[]>(from: Query.Factory<void, A>): Query.Template<A>;

/**
 * Build a select, selecting what the function returns.
 *
 * `where(Class)` adds a table, `where(column)` a condition.
 *
 * Return a column for its values, an object for rows of that shape, a table for its rows. Rows are frozen.
 * Runs when awaited, once per `then`.
 *
 * @example
 * class User extends Type { name = str(); admin = bool() }
 *
 * const names = await Query(where => {
 *   const user = where(User);
 *   where(user.admin).equal(true);
 *   return user.name;
 * });
 */
function Query<T extends {}>(from: Query.Function<T>): Query.Selects<T>;

/**
 * Build a write or a count - a query whose function returns nothing.
 *
 * Resolves the rows inserted, updated or deleted. With no write, the count of matching rows.
 */
function Query(from: Query.Function<void>): Query<number>;

function Query(factory: Query.Function<unknown> | Query.Factory<unknown, any[]>){
  function where(arg1: any, ...rest: any[]): any {
    if (typeof arg1 == "function")
      return builder.use(arg1, ...rest);

    if (arg1 instanceof Field)
      return builder.field(arg1);

    if (builder.tables.has(arg1))
      return builder.table(arg1);

    if (arg1 instanceof Cond || arg1 instanceof Group)
      return builder.andOr(arg1, ...rest);

    if (typeof arg1 == "number"){
      builder.limit = arg1;
      return;
    }

    if (typeof arg1 == "string")
      return new QueryTemplate(arg1, builder);

    if (arg1 && Symbol.iterator in arg1)
      return builder.with(arg1);

    throw new Error(`Argument ${arg1} is not a query argument.`);
  }

  Object.defineProperty(where, "connection", {
    get: () => builder.connection,
    set: to => builder.connection = to
  })

  const builder = new Builder();
  const helper: Query.Functions | undefined = factory.length > 1
    ? Object.assign((template: string) => new QueryTemplate(template, builder), Query.fn)
    : undefined;

  let result = factory.call(builder, where as Query.Where, helper!);
  let template: boolean | undefined;

  if (typeof result === 'function'){
    const params = builder.inject(result.length);
    result = (result as Function)(...params);
    template = true;
  }

  builder.commit(result);

  const runner = builder.prepare();

  return template ? runner : runner();
}

Object.defineProperty(Query, "Builder", { get: () => Builder });
Query.fn = { ...MathOps, bit: BitWise } as Query.Functions;

export { Query };
