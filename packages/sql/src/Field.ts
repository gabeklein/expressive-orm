import { Knex } from "knex";
import { Query } from "./Query";
import { Type } from "./Type";
import { underscore } from "./utils";

const FIELD = new Map<symbol, Field.Init>();

type Nullable = { nullable: true };
type Optional = { optional: true };

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

  type Queries<T> = Field & { proxy(table: Query.Table): T }

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

abstract class BaseField {
  property: string;
  parent: Type.EntityType;

  /**
   * Optional method generates value of property this Field is applied to when accessed inside a query.
   * If not defined, the value will be the Field itself.
   * 
   * @returns {T} Value to be used in context of query, interfacing with this Field.
   */
  proxy?(table: Query.Table): unknown;

  /**
   * This method dictates behavior of this field when converted from a javascript context to SQL.
   * 
   * Use this method to validate, sanitize or convert data before it is inserted into the database.
   */
  abstract set(value: unknown): void;

  /**
   * This method dictates behavior of this field when converted from a SQL context to javascript.
   * 
   * Use this method to parse data incoming from the database itself. For example, you might convert
   * a TINYINT(1) field to a boolean, or a DATETIME field to a Date object.
   */
  abstract get(value: any): unknown;

  constructor(){
    this.parent = focusParent!;
    this.property = focusProperty!;

    focusParent = undefined;
    focusProperty = undefined;
  }

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
}

class Field<T = unknown> extends BaseField {
  column = underscore(this.property);
  
  type: string = "";
  unique: boolean = false;
  nullable: boolean = false;
  optional: boolean = false;
  increment: boolean = false;
  default?: unknown = undefined;

  /** Real datatype of this field in database. */
  get datatype(){
    return this.type;
  }

  set(value: T){
    if(value != null || this.nullable || this.default || this.increment)
      return
    
    throw new Error(`Column requires a value but got ${value}.`);
  }

  get(value: any): T {
    return value;
  }

  /**
   * This method is used to generate a column in a SQL table.
   *  
   * @param table The table being created.
   * @returns The column definition.
   */
  create(table: Knex.CreateTableBuilder){
    if(!this.datatype)
      return;

    const col = this.increment
      ? table.increments(this.column)
      : table.specificType(this.column, this.datatype);

    if(!this.nullable)
      col.notNullable();

    if(this.unique)
      col.unique();

    if(this.default)
      col.defaultTo(this.default);

    return col;
  }

  /**
   * This methods verifies that the column in the database matches the settings expected by this Field.
   * Will throw an error if the column does not match, unless the `fix` parameter is set to true and schema is corrected.
   * 
   * @param info Information about the column in the database.
   * @param fix Whether to automatically fix the column to match this Field's settings.
   */
  async sync(info: Knex.ColumnInfo, fix?: boolean){
    const signature = info.type + (info.maxLength ? `(${info.maxLength})` : '');

    if (signature.toLowerCase() !== this.datatype.toLowerCase())
      throw new Error(
        `Column ${this.column} in table ${this.parent.table} has type ${signature}, expected ${this.datatype}`
      );

    if (info.nullable !== this.nullable)
      throw new Error(
        `Column ${this.column} in table ${this.parent.table} has incorrect nullable value`
      );
  }
}

export { FIELD, Field, Nullable, Optional };