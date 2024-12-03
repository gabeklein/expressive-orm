import { Query } from "./Query";
import { Type } from "./Type";
import { underscore } from "./utils";

export const FIELD = new Map<symbol, Field.Init>();

declare namespace Field {
  type Init<T extends Field = Field> =
    (key: string, parent: Type.EntityType) => Partial<T> | void;

  type Opts<T extends Field = Field> = Partial<T> | Init<T>;

  type Modifier<T, TT extends Field> =
    T extends { nullable: true } ? TT & Nullable :
    T extends { default?: any, increment?: true } ? TT & Optional :
    TT;

  type Specify<T, TT extends Field, D extends Field = TT> =
    Modifier<T, T extends { type: infer U } ? Extract<TT, { type: U }> : D>;

  type Returns<T> = Field & { get(value: any): T }

  type Accepts<T> = Field & { set(value: T): void }

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
}

let focusParent: Type.EntityType | undefined;
let focusProperty: string | undefined;

class BaseField {
  property: string;
  parent: Type.EntityType;

  constructor(){
    this.parent = focusParent!;
    this.property = focusProperty!;

    focusParent = undefined;
    focusProperty = undefined;
  }
}

class Field<T = unknown> extends BaseField {
  static new<T extends Field>(
    this: new (...args: any[]) => T,
    options: Field.Opts<T> = {}
  ){
    const placeholder = Symbol('field');
    
    FIELD.set(placeholder, (property, parent) => {
      focusParent = parent;
      focusProperty = property;

      const field = new this();

      if (typeof options === "function")
        options = options(property, parent) || {};

      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined)
          Object.defineProperty(field, key, {
            enumerable: true,
            value
          });
      });

      Object.freeze(field);
      parent.fields.set(property, field);
    });

    return placeholder as unknown as T;
  }

  column = underscore(this.property);
  type = "";

  primary: boolean = false;
  unique: boolean = false;
  nullable: boolean = false;
  optional: boolean = false;
  increment: boolean = false;
  default: string | null = null;
  index: number = 0;

  references?: {
    table: string;
    column: string;
  };

  get datatype(){
    return this.type;
  }

  query(table: Query.Table){
    const value = Object.create(this);
    const ref = `${table.alias || table.name}.${this.column}`;

    value.toString = () => ref;

    return value as unknown as T;
  }

  get(value: any): T {
    return value;
  }

  set(value: T){
    if(value !== null)
      return;

    if(this.nullable || this.default || this.primary)
      return
    
    throw new Error(
      `Column ${this.parent.name}.${this.column} is not nullable and requires a value.`
    );
  }
}

type Nullable = { nullable: true };
type Optional = { optional: true };

export { Field, Nullable, Optional };