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
  // why is this non-nullable?
  this!: Type.EntityType;

  /**
   * Primary key of this entity.
   * May be any name in the actual database, however requred to be `id` as property of this type.
   * 
   * Setting to zero will disable this field, and ORM will not expect it to be present in the database.
   * TODO: Not applicable anymore.
   */
  id = Primary();

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

  static insert<T extends Type>(this: Type.EntityType<T>, entries: Type.Insert<T> | Type.Insert<T>[]): Type.InsertOp;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, map: (index: number) => Type.Insert<T>): Type.InsertOp;
  static insert<T extends Type, I>(this: Type.EntityType<T>, inputs: Array<I>, map: (value: I, index: number) => Type.Insert<T>): Type.InsertOp;
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
    const query = table.insert(rows);

    return {
      then(resolve: (res: any) => any, reject: (err: any) => any){
        return query.then(x => x[0]).then<T[]>(resolve).catch(reject);
      },
      toString: () => query.toString()
    }
  }

  static get<T extends Type>(this: Type.EntityType<T>, limit?: number): SelectQuery<T>;
  static get<T extends Type>(this: Type.EntityType<T>, where?: Type.Query<T, void>): SelectQuery<T>;
  static get<T extends Type, R>(this: Type.EntityType<T>, limit: number, where: Type.Query<T, R>): SelectQuery<R>;
  static get<T extends Type, R>(this: Type.EntityType<T>, arg1?: Type.Query<T, R> | number, arg2?: Type.Query<T, R>){
    if(typeof arg1 == "function")
      arg2 = arg1;
    
    const query = Query(where => {
      const self = where(this);
      return typeof arg2 == "function" && arg2(self, where) || self;
    });
    
    return typeof arg1 === "number" ? query.get(arg1) : query;
  }

  static one<T extends Type, R extends {}>(this: Type.EntityType<T>, query: Type.Query<T, R>): Promise<Query.Extract<R>>;
  static one<T extends Type>(this: Type.EntityType<T>, query: Type.Query<T, void>): Promise<Type.Values<T>>;
  static one<T extends Type, R extends {}>(this: Type.EntityType<T>, query: Type.Query<T, R>){
    return Query(where => {
      const self = where(this);
      return where ? query(self, where) : self;
    }).one();
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
      const value = field.set(data[key as Type.Fields<T>]);

      if(value !== undefined)
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

export function isTypeConstructor(obj: unknown): obj is typeof Type {
  return typeof obj === 'function' && obj.prototype instanceof Type;
}

export { Type, digest }