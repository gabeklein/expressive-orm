import { Query } from '..';
import { Builder, Cond } from '../query/Builder';
import { capitalize, create, defineProperty, escape, freeze, getOwnPropertyDescriptor, underscore } from '../utils';
import { Type } from './Type';

const REGISTER = new Map<Type.EntityType, Map<string, Field>>();

type Nullable = { nullable: true };
type Optional = { optional: true };

declare namespace Field {
  type Init<T extends Field = Field> = (self: T) => Partial<T> | void;

  type Opts<T extends Field = Field> = Partial<T>;

  type Modifier<T, TT extends Field> =
    T extends { nullable: true } ? TT & Nullable :
    T extends { fallback?: any, increment?: true } ? TT & Optional :
    TT;

  /** @deprecated */
  type Specify<T, TT extends Field, D extends Field = TT> =
    Modifier<T, T extends { type: infer U } ? Extract<TT, { type: U }> : D>;

  type FieldOnly<T> = T extends Field ? T : never;

  type Choose<T, TS> = 
    FieldOnly<
      T extends { type: infer U } ? (U extends keyof TS ? TS[U] : never) :
        TS extends { default: infer U } ? U : T extends Partial<infer U> ? U : never
    >;

  type Type<T, TT> = Modifier<T, Choose<T, TT>>;

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

  type Compare<T> = {
    is(value: Query.Value<T>): Cond;
    not(value: Query.Value<T>): Cond;
    over(value: Query.Value<T>, orEqual?: boolean): Cond;
    under(value: Query.Value<T>, orEqual?: boolean): Cond;
    in(value: Query.Value<T>[]): Cond;
  }

  const does: (callback: Callback) => void;
}

class Field<T = unknown> {
  type = "";
  unique = false;
  nullable = false;
  optional = false;
  increment = false;
  fallback?: unknown;

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

  get column(){
    return underscore(this.property);
  }

  constructor(private options?: Field.Opts){
    Object.assign(this, options);
  }

  create(property: string, parent: Type.EntityType): this {
    const { options } = this;
    const field = create(this);

    if(options)
      for(const key in options){
        const value = (options as any)[key];

        if(value !== undefined && value !== (this as any)[key])
          (this as any)[key] = value;
      }

    field.parent = parent;
    field.property = property;

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

  raw(value: T): string {
    return escape(this.set(value));
  };

  /**
   * This method is used to compare this field with another value in a query.
   * 
   * @param acc Set of comparisons to be added to if not part of a group.
   */
  where(): Field.Compare<T> {
    const use = (op: string) =>
      (right: unknown, orEqual?: boolean) =>
        this.query!.where(this, op + (orEqual ? '=' : ''), right)

    return <any> {
      is: use("="),
      in: use("IN"),
      not: use("<>"),
      over: use(">"),
      under: use("<")
    };
  }
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