import { Field, Type } from '..';
import { Computed } from './math';
import { QueryBuilder } from './QueryBuilder';
import { Syntax } from './syntax';

declare namespace Query { 
  interface Table<T extends Type = any> {
    type: Type.EntityType<T>;
    query: QueryBuilder;
    name: string;
    proxy: Query.From<T>;
    alias?: string;
    local: Map<string, Field>;
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

    type Equal<T extends Type = any> = { [K in keyof T]?: Field | Query.From };
    
    type On<T extends Type> = Function | Equal<T>;

    type Left<T extends Type> = Partial<From<T>>;
  }

  type Join<T extends Type> = From<T>;

  type Value<T = any> = T | Field<T> | Computed<T>;

  type Where = typeof where;

  interface Verbs <T extends Type> {
    delete(): void;
    update(values: Query.Update<T>): void;
  }

  type Updates<T> = Field.Updates<T> | T;

  type Update<T extends Type> = {
    [K in Type.Fields<T>]?: Updates<T[K]>;
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

interface Query<T> extends PromiseLike<T> {
  /** Counts the number of rows that would be selected. */
  count(): Promise<number>;

  /** Returns the SQL string generated by this query. */
  toString(): string;
}

interface SelectQuery<T> extends Query<T[]> {
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

function Query<T = void>(factory: Query.Function<T>): Query<T> | SelectQuery<T> {
  const builder = new QueryBuilder();
  const context = where.bind(builder) as Query.Where;

  builder.selects = factory(context);

  async function get(limit?: number) {
    const self = builder.extend();

    if (limit)
      self.limit = limit;

    const res = await self.send();

    return self.parse ? self.parse(res) : res;
  }

  async function one(orFail?: boolean) {
    const res = await get(1);

    if (res.length == 0 && orFail)
      throw new Error("Query returned no results.");

    return res[0] as T;
  }
  
  const runner: Query<T> = {
    then: (resolve, reject) => get().then(resolve).catch(reject),
    count: () => builder.extend({ selects: undefined, parse: undefined }).send(),
    toString: () => String(builder)
  }

  if(builder.selects)
    return { ...runner, get, one } as SelectQuery<T>;

  return runner;
}

/** Specify the limit of results returned. */
function where(limit: number): void;

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
  if(typeof arg1 == "number"){
    this.limit = arg1;
    return;
  }

  if(Type.is(arg1))
    return arg2
      ? this.join(arg1, arg2, arg3)
      : this.use(arg1).proxy;

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

  const table = this.tables.get(arg1);

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

export { Query, SelectQuery };