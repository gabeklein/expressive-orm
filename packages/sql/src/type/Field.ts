import { Query } from '..';
import { Group, Parameter } from '../query/Builder';
import { capitalize, create, escape, freeze, getOwnPropertyDescriptor, underscore } from '../utils';
import { Type } from './Type';

const REGISTER = new Map<Type.EntityType, Map<string, Field>>();
const FIELD = new Map<symbol, (key: string, parent: Type.EntityType) => Partial<Field> | void>();

type Nullable = { nullable: true };
type Optional = { optional: true };

declare namespace Field {
  type Init<T extends Field = Field> = (self: T) => Partial<T> | void;

  type Opts<T extends Field = Field> = Partial<T> | Init<T>;

  type Modifier<T, TT extends Field> =
    T extends { nullable: true } ? TT & Nullable :
    T extends { fallback?: any, increment?: true } ? TT & Optional :
    TT;

  type Specify<T, TT extends Field, D extends Field = TT> =
    Modifier<T, T extends { type: infer U } ? Extract<TT, { type: U }> : D>;

  type Returns<T> = Field & { get(value: any): T }

  type Accepts<T> = Field & { set(value: T, data: unknown): void }

  type Queries<T> = Field & { use(table: Query.Builder): T }

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

  type Compare<T> = {
    is(value: Query.Value<T>): string;
    not(value: Query.Value<T>): string;
    over(value: Query.Value<T>, orEqual?: boolean): string;
    under(value: Query.Value<T>, orEqual?: boolean): string;
    in(value: Query.Value<T>[]): string;
  }
}

interface Field<T = unknown> {
  type: string;
  unique: boolean;
  nullable: boolean;
  optional: boolean;
  increment: boolean;
  fallback?: unknown;

  property: string;
  parent: Type.EntityType;

  table?: Query.Table;
  query?: Query.Builder;

  foreignKey?: string;
  foreignTable?: string;

  /** Real datatype of this field in database. */
  datatype: string;

  column: string;

  /**
   * Optional method generates value of property this Field is applied to when accessed inside a query.
   * If not defined, the value will be the Field itself.
   * 
   * @returns {T} Value to be used in context of query, interfacing with this Field.
   */
  use?(query: Query.Builder): unknown;

  /**
   * This method dictates behavior of this field when converted from a javascript context to SQL.
   * 
   * Use this method to validate, sanitize or convert data before it is inserted into the database.
   */
  set(value: T): any;

  /**
   * This method dictates behavior of this field when converted from a SQL context to javascript.
   * 
   * Use this method to parse data incoming from the database itself. For example, you might convert
   * a TINYINT(1) field to a boolean, or a DATETIME field to a Date object.
   */
  get(value: any): T;

  raw(value: T): string;

  /**
   * This method is used to compare this field with another value in a query.
   * 
   * @param acc Set of comparisons to be added to if not part of a group.
   */
  where(acc?: Group): Field.Compare<T>;
}

function Field<T extends Field>(options?: Field.Init<T>): T
function Field<T extends Field>(options?: Partial<T> ): T
function Field<T extends Field>(options?: Field.Opts<T>){
  const placeholder = Symbol('field');
  
  FIELD.set(placeholder, (property, parent) => {
    const field = create(Field.prototype) as T;

    field.parent = parent;
    field.property = property;
    field.column = underscore(property);

    if (typeof options === "function")
      options = options(field) || {};

    for(const key in options){
      const value = (options as any)[key];

      if(value !== undefined)
        (field as any)[key] = value;
    }

    if(!field.datatype)
      field.datatype = field.type;

    freeze(field);
    parent.fields.set(property, field);
  });

  return placeholder as unknown as T;
}

Field.prototype = <Field> {
  type: "",
  unique: false,
  nullable: false,
  optional: false,
  increment: false,
  fallback: undefined,
  toString(){
    const { column, table } = this;

    if(table)
      return `${table.alias || table.name}.${column}`;

    throw new Error("This requires a table to be set.");
  },
  get(value: any){
    return value;
  },
  set(value: any){
    return value;
  },
  raw(value: any){
    return escape(this.set(value));
  },
  where(acc?: Set<string>){
    const using = (op: string, right: unknown, orEqual?: boolean) => {
      if(typeof right == "function")
        right = right();

      if(right instanceof Parameter)
        right.digest = this.set.bind(this);
      else if(Array.isArray(right))
        right = `(${right.map(this.raw, this)})`;
      else if(!(right instanceof Field))
        right = this.raw(right);

      const e = `${this} ${op + (orEqual ? '=' : '')} ${right}`;
      if(acc) acc.add(e);
      return e;
    }

    return {
      in: using.bind(this, "IN"),
      is: using.bind(this, "="),
      not: using.bind(this, "<>"),
      over: using.bind(this, ">"),
      under: using.bind(this, "<")
    };
  }
}

function fields(from: Type.EntityType){
  let fields = REGISTER.get(from);

  if(!fields){
    fields = new Map<string, Field>();

    REGISTER.set(from, fields);
    
    const reference = new (from as any)();
    
    for(const key in reference){
      const { value } = getOwnPropertyDescriptor(reference, key)!;
      const instruction = FIELD.get(value);    
  
      if(!instruction)
        throw new Error(
          `Entities do not support normal values, only fields. ` +
          `Did you forget to import \`${capitalize(typeof value)}\`?`
        );
  
      FIELD.delete(value);
      instruction(key, from);
    }
  }

  return fields;
}

export {
  fields,
  Field,
  Nullable,
  Optional
};