import { Query } from '..';
import { Builder } from '../query/Builder';
import { defineProperty } from '../utils';
import { Table } from './Table';

type Nullable = { nullable: true };
type Optional = { optional: true };

declare namespace Field {
  type Init<T extends Field = Field> = (self: T) => Partial<T> | void;

  type Args<T extends Field = Field> = (Partial<T> | null | string)[];

  type Type<T extends any[], A, D extends Field = any> = 
    T extends [infer First, ...infer Rest] ?
      First extends { type: infer I } ? (I extends keyof A ? A[I] : D) :
      Type<Rest, A, D> :
    A extends { default: infer V } ? V : D;

  type Mod<T extends any[], TT> = 
    T extends [infer First, ...infer Rest] ?
      // TODO: should this be conflated with Optional?
      First extends { nullable?: true, optional?: true } | null ? TT & Nullable :
      First extends { fallback?: any, increment?: true, primary?: true, default?: true } ? TT & Optional :
      Mod<Rest, TT> :
    TT;

  type Infer<T extends any[], A, D extends Field = any> = Mod<T, Type<T, A, D>>;

  type Returns<T> = Field & { get(value: any): T }

  type Accepts<T> = Field & { set(value: T, data: unknown): void }

  type Queries<T> = Field & { use(table: Builder): T }

  type Updates<T> =
    T extends Accepts<infer U> ?
    (T extends Nullable ? U | null : U) | undefined :
    never;

  type Assigns<T> =
    T extends Accepts<infer U> ?
      T extends Nullable ? U | null | undefined :
      T extends Optional ? U | undefined :
      U :
    never;

  type Output = Record<string, string | number>;

  const does: (callback: Callback) => void;
}

class Field<T = unknown> {
  type = "";
  unique = false;
  nullable = false;
  optional = false;
  absent = false;
  increment = false;
  fallback?: unknown;
  
  column!: string;
  property!: string;
  parent!: Table.Type;
  
  table?: Query.ITable;
  query?: Builder;

  /** If column has a reference constraint, applicable field is listed here. */
  reference?: Field;

  /** Real datatype of this field in database. */
  get datatype(){
    return this.type;
  }

  static new<T extends Field>(
    this: new (...args: any[]) => T, ...options: Field.Args<T>): Field {

    return Object.assign(new this, ...options.map(x => (
      typeof x === "string" ? { column: x } :
      x === null ? { nullable: true } :
      x
    )));
  }

  init?(property: string, parent: Table.Type): void;

  /**
   * Optional method generates value of property this Field is applied to when accessed inside a query.
   * If not defined, the value will be the Field itself.
   * 
   * @returns {T} Value to be used in context of query, interfacing with this Field.
   */
  use?(query: Builder): unknown;

  /**
   * This method dictates behavior of this field when converted from a javascript context to SQL.
   * 
   * Use this method to validate, sanitize or convert data before it is inserted into the database.
   */
  set(value: T): any {
    return value;
  };

  /**
   * This method dictates behavior of this field when converted from a SQL context to javascript.
   * 
   * Use this method to parse data incoming from the database itself. For example, you might convert
   * a TINYINT(1) field to a boolean, or a DATETIME field to a Date object.
   */
  get(value: any): T {
    return value;
  };
}

type Callback = (parent: Table.Type, property: string) => void;

defineProperty(Field, "does", {
  value: (callback: Callback) => callback
});

export {
  Field,
  Nullable,
  Optional
};