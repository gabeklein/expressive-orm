import { Knex } from 'knex';
import { Connection } from './connection/Connection';
import { FIELD, Field } from './Field';
import { Query } from './Query';

export type InstanceOf<T> = T extends { prototype: infer U } ? U : never;

const REGISTER = new Map<Type.EntityType, Map<string, Field.Defined>>();
const CONNECTION = new Map<typeof Type, Connection>();

const describe = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;

declare namespace Type {
  type EntityType<T extends Type = Type> =
    & (abstract new () => T)
    & typeof Type;

  type List<T extends Type> = T[];

  type DataRecusive<T> =
    T extends string ? string :
    T extends number ? number :
    T extends boolean ? boolean :
    T extends List<infer U> ? Pure<U>[] :
    T extends Type ? Pure<T> : T;

  type Pure<T extends Type> = {
    [K in Field<T>]-?: DataRecusive<T[K]>;
  }

  type Field<T extends Type> = Exclude<keyof T, "table">;

  namespace Insert {
    type Property<T> = T extends Type ? T | number : T;
  }

  type Insert<T extends Type> = {
    [K in Type.Field<T>]?: Insert.Property<T[K]>;
  }

  type QueryFunction<T extends Type, R> =
    (query: Query.FromType<T>, where: Query.Where) => R;
}

abstract class Type {
  // why is this non-nullable?
  this!: Type.EntityType;

  /**
   * Primary key of this entity.
   * May be any name in the actual database, however requred to be `id` as property of this type.
   * 
   * Setting to zero will disable this field, and ORM will not expect it to be present in the database.
   */
  id: number | string = Field({
    datatype: "int",
    nullable: false,
    increment: true,
    primary: true
  });

  static table = "";
  static schema = "";
  static deps = new Set<Type.EntityType>();

  static focus?: { [key: string]: any };

  static get connection(){
    return CONNECTION.get(this) || Connection.default;
  }

  static set connection(connection: Connection){
    CONNECTION.set(this, connection);
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
    return Array.isArray(data) ? data.map(sanitize, this) : sanitize.call(this, data);  
  }

  static insert<T extends Type>(this: Type.EntityType<T>, data: Type.Insert<T> | Iterable<Type.Insert<T>>): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, number: number, mapper: (index: number) => Type.Insert<T>): Promise<void>;
  static insert<T extends Type>(this: Type.EntityType<T>, data: Type.Insert<T> | Iterable<Type.Insert<T>> | number, map?: (i: number) => Type.Insert<T>){
    if(typeof data == "number"){
      if(!map)
        throw new Error("Cannot insert a number without a map function!");
  
      data = Array.from({ length: data }, (_, i) => map(i));
    }
    else if(!isIterable(data))
      data = [data];

    if(!this.connection)
      throw new Error("No connection found for type");

    const rows = Array.from(data).map(sanitize, this);
    const table = this.connection.knex(this.table);
    
    return table.insert(rows) as Knex.QueryBuilder;
  }

  static get<T extends Type, R>(
    this: Type.EntityType<T>,
    query: Type.QueryFunction<T, R>){

    return Query(where => {
      return query(where(this), where);
    });
  }
}

function init(type: Type.EntityType){
  const fields = new Map();

  if(!type.table)
    type.table = type.name.replace(/^[A-Z]/, m => m.toLowerCase());

  REGISTER.set(type, fields);
  
  const reference = new (type as any)();
  
  for(const key in reference){
    const { value } = describe(reference, key)!;
    const instruction = FIELD.get(value);    

    if(!instruction)
      throw new Error(`Entities do not support normal values, only fields. Did you forget to import \`${capitalize(typeof value)}\`?`);

    FIELD.delete(value);
    instruction(type, key);
    define(reference, key, {
      get: () => type.focus![key],
      set: is => type.focus![key] = is
    })
  }

  return fields;
}

function sanitize<T extends Type>(
  this: Type.EntityType<T>,
  data: Type.Insert<T>,
  index?: number,
  array?: Type.Insert<T>[]){

  const values: Record<string, any> = {};

  this.fields.forEach((field, key) => {
    const given = data[key as Type.Field<T>] as unknown;
    const which = array && array.length > 1 ? ` at [${index}]` : ""

    if(given == null){
      if(field.nullable || field.default || field.primary)
        return

      throw new Error(
        `Provided value for ${this.name}.${key} is ${given}${which} but column is not nullable.`
      );
    }

    try {
      const value = field.set ? field.set(given) : undefined;
      values[field.column] = value === undefined ? given : value;
    }
    catch(err: unknown){
      let message = `Provided value for ${this.name}.${key}${which} but not acceptable for type ${field.datatype}.`;

      if(typeof err == "string")
        message += `\n${err}`;

      throw err instanceof Error ? err : new Error(message);
    }
  });

  return values;
}

function isIterable(obj: unknown): obj is Iterable<unknown> {
  type MaybeIterable = {
    [Symbol.iterator]?: () => IterableIterator<unknown>;
  };

  return obj != null && typeof (obj as MaybeIterable)[Symbol.iterator] === 'function';
}

export function isTypeConstructor(obj: unknown): obj is typeof Type {
  return typeof obj === 'function' && obj.prototype instanceof Type;
}

export function capitalize(string: string){
  return string[0].toUpperCase() + string.slice(1);
}

export { Type }