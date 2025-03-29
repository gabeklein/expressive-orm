import { Connection, Query } from '..';
import { capitalize, defineProperty, getOwnPropertyDescriptor, isIterable, underscore } from '../utils';
import { Field, Nullable, Optional } from './Field';
import { Primary } from './Primary';

export const REGISTER = new Map<Table.Type, Map<string, Field>>();

declare namespace Table {
  type Type<T extends Table = Table> =
    & (abstract new () => T)
    & typeof Table;

  type Fields<T extends Table, O extends Partial<Field> = never> = {
    [K in keyof T]: T[K] extends Field ? T[K] extends O ? never : K : never
  }[keyof T];

  type Required<T extends Table> = Fields<T, Nullable | Optional>;

  type NonNull<T extends Table> = Fields<T, Nullable>;

  type Insert<T extends Table> =
    & { [K in Fields<T>]?: Field.Assigns<T[K]> }
    & { [K in Required<T>]: Field.Assigns<T[K]> }

  type Values<T extends Table> = { "id": number } & {
    [K in Fields<T>]: T[K] extends Field.Returns<infer U> ? U : never
  }

  type Query<T extends Table, R> =
    (query: Query.From<T>, where: Query.Where) => R;

  interface InsertOp extends PromiseLike<void> {
    toString(): string;
  }
}

abstract class Table {
  this!: Table.Type;

  /**
   * Primary key of this entity.
   * May be any name in the actual database, however requred to be `id` as property of this type.
   */
  id = Primary();

  static schema = "";

  static connection?: Connection;

  static get fields(){
    let fields = REGISTER.get(this);
  
    if(!fields){
      fields = new Map<string, Field>();

      defineProperty(this, "fields", { value: fields });
  
      const reference = new (this as any)();
      
      for(const key in reference){
        const { value } = getOwnPropertyDescriptor(reference, key)!;
    
        if(value instanceof Field){
          const instance = value.create(key, this);
  
          fields.set(key, instance);
          // TODO: absent assignment makes this not possible
          // freeze(instance);
        }
        else if(typeof value === "function"){
          value(this, key);
        }
        else throw new Error(
          `Entities do not support normal values, only fields. ` +
          `Did you forget to import \`${capitalize(typeof value)}\`?`
        ); 
      }
    }
  
    return fields;
  }

  static get table(){
    // chop off trailing numbers from transpiled class name
    return this.table = underscore(this.name.replace(/\d+$/, ""));
  }

  static set table(value: string){
    defineProperty(this, "table", { value });
  }

  static toString(){
    return this.name;
  }

  static is(obj: unknown): obj is Table.Type {
    return typeof obj === 'function' && obj.prototype instanceof Table;
  }

  static insert<T extends Table>(this: Table.Type<T>, entries: Table.Insert<T> | Table.Insert<T>[]): Query<number>;
  static insert<T extends Table>(this: Table.Type<T>, number: number, map: (index: number) => Table.Insert<T>): Query<number>;
  static insert<T extends Table, I>(this: Table.Type<T>, forEach: Array<I>, map: (value: I, index: number) => Table.Insert<T>): Query<number>;
  static insert<T extends Table>(
    this: Table.Type<T>,
    arg1: Table.Insert<T> | Iterable<unknown> | number,
    arg2?: Table.Insert<any> | Function,
  ){
    let data: Table.Insert<T>[];

    if(typeof arg2 == "function"){
      if(typeof arg1 == "number")
        data = Array.from({ length: arg1 }, (_, i) => arg2(i));
      else if(isIterable(arg1))
        data = Array.from(arg1, arg2 as (i: unknown, k: number) => Table.Insert<T>);
      else
        throw new Error("Map function needs an input iterable or a number to generate data.");
    }
    else if(isIterable(arg1))
      data = Array.from(arg1) as Table.Insert<T>[];
    else if(typeof arg1 == "object")
      data = [arg1];
    else
      throw new Error("Invalid input for insert method.");

    return Query(where => {
      where(this, ...data);
    })
  }

  static get<T extends Table>(this: Table.Type<T>, limit?: number): Query.Selects<T>;
  static get<T extends Table>(this: Table.Type<T>, where?: Table.Query<T, void>): Query.Selects<T>;
  static get<T extends Table, R>(this: Table.Type<T>, limit: number, where: Table.Query<T, R>): Query.Selects<R>;
  static get<T extends Table, R>(this: Table.Type<T>, arg1?: Table.Query<T, R> | number, arg2?: Table.Query<T, R>){
    const limit = typeof arg1 == "number" ? arg1 : undefined;
    const query = typeof arg1 == "function" ? arg1 : arg2;
    
    return Query<any>(where => {
      const self = where(this);

      if(limit)
        where(limit);

      return typeof query == "function" && query(self, where) || self;
    });
  }

  static one<T extends Table, R extends {}>(this: Table.Type<T>, query: Table.Query<T, R>): Promise<Query.Returns<R>>;
  static one<T extends Table>(this: Table.Type<T>, query?: Table.Query<T, void>): Promise<Table.Values<T>>;
  static one<T extends Table>(this: Table.Type<T>, id: number): Promise<Table.Values<T>>;
  static one(this: Table.Type, query?: Table.Query<Table, any> | number){
    return Query(where => {
      const self = where(this);

      if(typeof query == "function")
        return query(self, where) || self;

      if(typeof query == "number")
        where(self.id).is(query);
      else
        where(self.id).desc();
      
      return self;
    }).one(true);
  }
}

export { Table }