import { Field } from '../Field';
import type { Rows } from '../rows';
import type { Type } from '../Type';
import { Builder } from './Builder';
import { BitWise, Computed, MathOps } from './Computed';
import { Cond, Expression, Group, QueryTemplate } from './Value';

declare const ENTITY: unique symbol;

declare namespace Query {
  const Builder: typeof import('./Builder').Builder;

  type ITable = Builder.ITable;

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

  type From<T = any> = { [K in Keys<T>]: Column<T[K]> } & { readonly [ENTITY]: T };

  type Join<T = any> = { [K in Keys<T>]?: Column<T[K]> } & { readonly [ENTITY]: T };

  type Value<V> = Field<V | undefined> | Computed<V>;

  type Match<V = any> = V | Value<NonNullable<V>> | (undefined extends V ? null : never);

  type Assigns<V> =
    [NonNullable<V>] extends [Type]
      ? NonNullable<V> | number | From<NonNullable<V>> | Value<number>
      : V | Value<NonNullable<V>>;

  type Writable<T> = Exclude<Keys<T>, "id">;

  type Insert<T> =
    & { [K in Writable<T> as undefined extends T[K] ? never : K]: Assigns<T[K]> }
    & { [K in Writable<T> as undefined extends T[K] ? K : never]?: Assigns<T[K]> | null };

  type Update<T> = {
    [K in Writable<T>]?: Assigns<T[K]> | (undefined extends T[K] ? null : never)
  };

  type FromData<T extends {}> = { [K in keyof T]: Field<T[K]> };

  interface Functions extends MathOps {
    (template: string): QueryTemplate;
    bit: BitWise;
  }

  type Where = {
    (limit: number): void;
    (template: string): QueryTemplate;
    (...orWhere: Expression[]): Group;
    <T>(entity: Table<T>, optional: true): Join<T>;
    <T>(entity: Table<T>): From<T>;
    <T>(entity: Table<T>, ...inserts: Insert<T>[]): From<T>;
    <T>(field: From<T> | Join<T>): Verbs<T>;
    <V>(field: Field<V> | undefined): Asserts<V>;
    <T extends {}>(data: Iterable<T>): FromData<T>;
    connection: Type.Connection | undefined;
  }

  type Compare<V> = {
    equal(value: Match<V>): Expression;
    not(value: Match<V>): Expression;
    over(value: Match<V>, orEqual?: boolean): Expression;
    under(value: Match<V>, orEqual?: boolean): Expression;
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
    T extends { readonly [ENTITY]: any } ? { [K in Exclude<keyof T, typeof ENTITY>]: Returns<T[K]> } :
    T extends {} ? { [K in keyof T]: Returns<T[K]> } :
    T;

  type Row<T> = T extends { readonly [ENTITY]: infer U } ? U : Returns<T>;

  interface Verbs<T> {
    delete(): void;
    update(values: Update<T>): void;
  }

  interface Selects<T> extends Query<Row<T>[]> {
    get(): Promise<Row<T>[]>;

    one(orFail: true): Promise<Row<T>>;
    one(orFail?: boolean): Promise<Row<T> | undefined>;
  }
}

interface Query<T = any> extends PromiseLike<T> {
  toString(): string;

  params: unknown[];
}

function Query<T extends {}, A extends unknown[]>(from: Query.Factory<T, A>): Query.TemplateSelects<T, A>;

function Query<A extends unknown[]>(from: Query.Factory<void, A>): Query.Template<A>;

function Query<T extends {}>(from: Query.Function<T>): Query.Selects<T>;

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

// Builder and Query form an import cycle; defer the reference so it resolves
// after both modules finish initializing, regardless of evaluation order.
Object.defineProperty(Query, "Builder", { get: () => Builder });
Query.fn = { ...MathOps, bit: BitWise } as Query.Functions;

export { Query };
