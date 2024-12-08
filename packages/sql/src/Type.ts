import { Knex } from 'knex';

import { Connection } from './connection/Connection';
import { FIELD, Field, Nullable, Optional } from './Field';
import { Query, SelectQuery } from './Query';
import { capitalize, isIterable, underscore } from './utils';

const REGISTER = new Map<Type.EntityType, Map<string, Field>>();

const describe = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;

declare namespace Type {
  type EntityType<T extends Type = Type> =
    & (abstract new () => T)
    & typeof Type;

  type Fields<T extends Type, O extends Partial<Field> = never> = {
    [K in keyof T]: T[K] extends Field ? T[K] extends O ? never : K : never
  }[keyof T];

  type Required<T extends Type> = Fields<T, Nullable | Optional>;

  type NonNull<T extends Type> = Fields<T, Nullable>;

  type Insert<T extends Type> =
    & { [K in Fields<T>]?: Field.Assigns<T[K]> }
    & { [K in Required<T>]: Field.Assigns<T[K]> }

  type Query<T extends Type, R> =
    (query: Query.From<T>, where: Query.Where) => R;
}

abstract class Type {
  // why is this non-nullable?
  this!: Type.EntityType;

  /**
   * Primary key of this entity.
   * May be any name in the actual database, however requred to be `id` as property of this type.
   * 
   * TODO: Not applicable anymore. vvv
   * Setting to zero will disable this field, and ORM will not expect it to be present in the database.
   */
  id = Primary.new();

  static schema = "";

  static get connection(){
    return this.connection = Connection.default;
  }

  static set connection(value: Connection){
    define(this, "connection", { value });
  }

  static get table(){
    return this.table = underscore(this.name);
  }

  static set table(value: string){
    define(this, "table", { value });
  }

  static toString(){
    return this.name;
  }

  static get fields(){
    return REGISTER.get(this) || init(this);
  }

  static digest<T extends Type>(data: Type.Insert<T>): Record<string, unknown>;
  static digest<T extends Type>(data: Type.Insert<T>[]): Record<string, unknown>[];
  static digest<T extends Type>(data: Type.Insert<T> | Type.Insert<T>[]){
    return Array.isArray(data) ? data.map(digest, this) : digest.call(this, data);  
  }

  static insert<T extends Type>(this: Type.EntityType<T>, entries: Type.Insert<T> | Type.Insert<T>[]): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, map: (index: number) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type, I>(this: Type.EntityType<T>, inputs: Iterable<I>, map: (input: I) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type>(
    this: Type.EntityType<T>,
    arg1: Type.Insert<T> | Iterable<unknown> | number,
    arg2?: Type.Insert<any> | Function,
  ){
    let data: Type.Insert<T>[];

    if(!this.connection)
      throw new Error("No connection found for type");

    if(typeof arg2 == "function"){
      if(typeof arg1 == "number")
        data = Array.from({ length: arg1 }, (_, i) => arg2(i));
      else if(isIterable(arg1))
        data = Array.from(arg1, arg2 as (i: unknown, k: number) => Type.Insert<T>);
      else
        throw new Error("Map function needs an input iterable or a number to generate data.");
    }
    else if(isIterable(arg1))
      data = Array.from(arg1) as Type.Insert<T>[];
    else if(typeof arg1 == "object")
      data = [arg1];
    else
      throw new Error("Invalid input for insert method.");
    
    const rows = this.digest(data);
    const table = this.connection.knex(this.table);
    
    return table.insert(rows) as Knex.QueryBuilder;
  }

  static get<T extends Type>(this: Type.EntityType<T>, query: Type.Query<T, void>): SelectQuery<T>;
  static get<T extends Type, R>(this: Type.EntityType<T>, query: Type.Query<T, R>): SelectQuery<R>;
  static get<T extends Type, R>(this: Type.EntityType<T>, query: Type.Query<T, R>){
    return Query(where => {
      const self = where(this);
      return query(self, where) || self;
    });
  }
}

function init(type: Type.EntityType){
  const fields = new Map<string, Field>();

  REGISTER.set(type, fields);
  
  const reference = new (type as any)();
  
  for(const key in reference){
    const { value } = describe(reference, key)!;
    const instruction = FIELD.get(value);    

    if(!instruction)
      throw new Error(`Entities do not support normal values, only fields. Did you forget to import \`${capitalize(typeof value)}\`?`);

    FIELD.delete(value);
    instruction(key, type);
  }

  return fields;
}

function digest<T extends Type>(
  this: Type.EntityType<T>,
  data: Type.Insert<T>,
  index?: number,
  array?: Type.Insert<T>[]){

  const values: Record<string, any> = {};

  this.fields.forEach((field, key) => {
    try {
      const given = data[key as Type.Fields<T>];
      const value = field.set(given);

      values[field.column] = value === undefined ? given : value;
    }
    catch(err: unknown){
      const which = array && array.length > 1 ? ` at [${index}]` : "";
      let message = `Provided value for ${this.name}.${key}${which} but not acceptable for type ${field.datatype}.`;

      if(err instanceof Error){
        err.message = message + "\n" + err.message;
        throw err;
      }
      
      if(typeof err == "string")
        message += `\n${err}`;

      throw new Error(message);
    }
  });

  return values;
}

class Primary extends Field<number> {
  readonly type = "int";
  readonly increment = true;
  readonly optional = true;
  readonly nullable = false;
  readonly primary = true;
}

export function isTypeConstructor(obj: unknown): obj is typeof Type {
  return typeof obj === 'function' && obj.prototype instanceof Type;
}

export { Type, digest }