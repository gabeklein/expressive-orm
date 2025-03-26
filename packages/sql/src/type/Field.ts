import { Query } from '..';
import { Builder } from '../query/Builder';
import { capitalize, create, defineProperty, freeze, getOwnPropertyDescriptor, underscore } from '../utils';
import { Type } from './Type';

const REGISTER = new Map<Type.EntityType, Map<string, Field>>();

type Nullable = { nullable: true };
type Optional = { optional: true };

declare namespace Field {
  type Init<T extends Field = Field> = (self: T) => Partial<T> | void;

  type Opts<T extends Field = Field> = Partial<T>;

  type Modifier<T, TT> =
    T extends { nullable: true } | true ? TT & Nullable :
    T extends { fallback?: any, increment?: true } ? TT & Optional :
    TT;

  type Type<T, A, D extends Field = any> = 
    T extends { type: infer U } ? (U extends keyof A ? A[U] : D) :
    A extends { default: infer U } ? U :
    D

  type Infer<T, A, D extends Field = any> = Modifier<T, Type<T, A, D>>;

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
  increment = false;
  fallback?: unknown;
  
  column!: string;
  property!: string;
  parent!: Type.EntityType;
  
  table?: Query.Table;
  query?: Builder;

  /** If column has a reference constraint, applicable field is listed here. */
  reference?: Field;

  /** Real datatype of this field in database. */
  get datatype(){
    return this.type;
  }

  static new<T extends Field>(
    this: new (...args: any[]) => T,
    options?: Field.Opts<T> | boolean): Field {

    if(typeof options === "boolean")
      options = { nullable: options } as Field.Opts<T>;

    return Object.assign(new this, options);
  }

  create(property: string, parent: Type.EntityType): this {
    const field = create(this);
    field.parent = parent;
    field.property = property;

    if(!field.column)
      field.column = underscore(property);

    return field;
  }

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

type Callback = (parent: Type.EntityType, property: string) => void;

defineProperty(Field, "does", {
  value: (callback: Callback) => callback
});

function fields(from: Type.EntityType){
  let fields = REGISTER.get(from);

  if(!fields){
    fields = new Map<string, Field>();

    REGISTER.set(from, fields);
    
    const reference = new (from as any)();
    
    for(const key in reference){
      const { value } = getOwnPropertyDescriptor(reference, key)!;
  
      if(value instanceof Field){
        const instance = value.create(key, from);

        from.fields.set(key, instance);
        freeze(instance);
      }
      else if(typeof value === "function"){
        value(from, key);
      }
      else throw new Error(
        `Entities do not support normal values, only fields. ` +
        `Did you forget to import \`${capitalize(typeof value)}\`?`
      ); 
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