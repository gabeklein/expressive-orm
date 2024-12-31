import { Field, Type } from '..';
import { Syntax } from '../type/Field';
import { Builder as QB } from './Builder';
import { Computed } from './Computed';

declare namespace Query { 
  interface Table<T extends Type = any> {
    toString(): string;
    name: string;
    proxy: Query.From<T>;
    local: Map<string, Field>;
    alias?: string;
    join?: {
      as: Query.Join.Mode;
      on: Set<Syntax>;
    }
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

  type Builder<T = any> = QB<T>;
  
  type Compare = Syntax | Compare[] | undefined;

  type From<T extends Type = Type> = {
    [K in Type.Fields<T>]: T[K] extends Field.Queries<infer U> ? U : T[K];
  }

  type Value<T = any> = T | Field<T> | Computed<T>

  type FieldOrValue<T> = T extends Value<infer U> ? U : T;

  type Where = Builder["where"] & { name: string };

  type Updates<T> = Field.Updates<T> | T;

  type Update<T extends Type> = {
    [K in Type.Fields<T>]?: Updates<T[K]>;
  }

  type Function<R> = (where: Where) => R;

  type Factory<R, A extends any[]> = (where: Where) => (...args: A) => R;
  
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

  type Asserts<T extends Field> = ReturnType<T["compare"]> & {
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
}

function Query<T extends {}, A extends unknown[]>(from: Query.Factory<T, A>): Query.TemplateSelects<T, A>;

function Query<A extends unknown[]>(from: Query.Factory<void, A>): Query.Template<A>;

function Query<T extends {}>(from: Query.Function<T>): Query.Selects<T>;

/**
 * Creates a new query.
 * Will return the number of rows that would be selected or modified.
 */
function Query(from: Query.Function<void>): Query;

function Query<T = number>(factory: Query.Function<T>){
  const builder = new QB(factory);
  const runner = builder.toRunner();

  if(builder.params){
    runner.toString = () => builder.toString();
    return runner;
  }

  return runner();
}

export { Query };