import { Connection, Query } from '..';
import { defineProperty, isIterable, underscore } from '../utils';
import { Field, fields, Nullable, Optional } from './Field';

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

  type Values<T extends Type> = { "id": number } & {
    [K in Fields<T>]: T[K] extends Field.Returns<infer U> ? U : never
  }

  type Query<T extends Type, R> =
    (query: Query.From<T>, where: Query.Where) => R;

  interface InsertOp extends PromiseLike<void> {
    toString(): string;
  }
}

abstract class Type {
  this!: Type.EntityType;

  /**
   * Primary key of this entity.
   * May be any name in the actual database, however requred to be `id` as property of this type.
   */
  id = Primary();

  static schema = "";

  static connection?: Connection;

  static get table(){
    return this.table = underscore(this.name);
  }

  static set table(value: string){
    defineProperty(this, "table", { value });
  }

  static toString(){
    return this.name;
  }

  static is(obj: unknown): obj is Type.EntityType {
    return typeof obj === 'function' && obj.prototype instanceof Type;
  }

  static get fields(){
    return fields(this);
  }

  static insert<T extends Type>(this: Type.EntityType<T>, values: Type.Insert<T>): Type.InsertOp;
  static insert<T extends Type>(this: Type.EntityType<T>, values: Type.Insert<T>[]): Type.InsertOp;
  static insert<T extends Type, I>(this: Type.EntityType<T>, forEach: Array<I>, map: (value: I, index: number) => Type.Insert<T>): Type.InsertOp;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, map: (index: number) => Type.Insert<T>): Type.InsertOp;
  static insert<T extends Type>(
    this: Type.EntityType<T>,
    arg1: Type.Insert<T> | Iterable<unknown> | number,
    arg2?: Type.Insert<any> | Function,
  ){
    let data: Type.Insert<T>[];

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
    
    const rows = data.map(digest, this);

    if(!this.connection)
      throw new Error("No connection found for type");

    return this.connection.insert(this.table, rows);
  }

  static get<T extends Type>(this: Type.EntityType<T>, limit?: number): Query.Selects<T>;
  static get<T extends Type>(this: Type.EntityType<T>, where?: Type.Query<T, void>): Query.Selects<T>;
  static get<T extends Type, R>(this: Type.EntityType<T>, limit: number, where: Type.Query<T, R>): Query.Selects<R>;
  static get<T extends Type, R>(this: Type.EntityType<T>, arg1?: Type.Query<T, R> | number, arg2?: Type.Query<T, R>){
    const limit = typeof arg1 == "number" ? arg1 : undefined;
    const query = typeof arg1 == "function" ? arg1 : arg2;
    
    return Query<any>(where => {
      const self = where(this);

      if(limit)
        where(limit);

      return typeof query == "function" && query(self, where) || self;
    });
  }

  static one<T extends Type, R extends {}>(this: Type.EntityType<T>, query: Type.Query<T, R>): Promise<Query.Extract<R>>;
  static one<T extends Type>(this: Type.EntityType<T>, query?: Type.Query<T, void>): Promise<Type.Values<T>>;
  static one<T extends Type>(this: Type.EntityType<T>, id: number): Promise<Type.Values<T>>;
  static one(this: Type.EntityType, query?: Type.Query<Type, any> | number){
    return Query(where => {
      const self = where(this);

      if(typeof query == "function")
        return query(self, where);

      if(typeof query == "number")
        where(self.id).is(query);
      else
        where(self.id).desc();
      
      return self;
    }).one(true);
  }
}

function digest<T extends Type>(
  this: Type.EntityType<T>,
  data: Type.Insert<T>,
  index?: number,
  array?: Type.Insert<T>[]){

  const values: Record<string, any> = {};

  this.fields.forEach((field, key) => {
    try {
      let value = data[key as Type.Fields<T>];
      
      if (value != null)
        value = field.set(value);
      else if (!field.nullable && !field.optional && !field.increment)
        throw new Error(`Column ${field.column} requires a value but got ${value}.`);
    
      if (value === undefined)
        return;

      values[field.column] = value;
    }
    catch(err: unknown){
      const which = array && array.length > 1 ? ` at [${index}]` : "";
      let message = `Provided value for ${this.name}.${key}${which} but not acceptable for type ${field.datatype}.`;

      if(err instanceof Error){
        err.message = message + "\n" + err.message;
        throw err;
      }

      if(typeof err == "string")
        message += "\n" + err;

      throw new Error(message);
    }
  });

  return values;
}

interface Primary extends Field<number> {
  readonly increment: true;
  readonly optional: true;
  readonly nullable: false;
  readonly primary: true;
}

function Primary() {
  return Field<Primary>({
    type: "int",
    increment: true,
    primary: true,
    unique: true,
  });
}

export { Type }