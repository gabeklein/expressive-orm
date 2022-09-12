import Connection from './connection/Connection';
import Entity from './Entity';
import Field from './Field';
import { stringify } from './mysql/stringify';
import { escapeString, qualify } from './utility';

export const Metadata = new WeakMap<{}, Query.Table>();

declare namespace Query {
  export type Function<R> = (query: Query) => (() => R) | R;

  export type Join =
    | "left"
    | "right"
    | "inner"
    | "outer";

  export type Mode =
    | "query"
    | "select"
    | "fetch";

  export interface Table {
    name: string;
    join?: Query.Join;
    alias?: string;
    on?: string[];
  }

  export type WhereFunction<T extends Entity> =
    (this: Fields<T>, thisArg: Fields<T>) => void;

  export type SelectFunction<T extends Entity, R> =
    (this: Select<T>, thisArg: Select<T>) => R;

  export type Options<T extends Entity, R> = {
    where?: WhereFunction<T>;
    select?: SelectFunction<T, R>;
  }

  export type Fields<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], undefined>;
  }

  export type Maybe<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], undefined> | null;
  }

  export type WhereField<T> =
    T extends number | string | boolean
      ? T | T[]
      : never;

  export type Select<T extends Entity> = {
    [K in Entity.Field<T>]: T[K];
  }

  export interface JoinFunction {
    <T extends Entity>(
      from: Entity.Type<T>,
      mode?: "right" | "inner"
    ): Query.Fields<T>;

    <T extends Entity>(
      from: Entity.Type<T>,
      mode: Query.Join
    ): Query.Maybe<T>;
  }
}

class Query<R = any> {
  static get<R>(from: Query.Function<R>){
    return new this(from).get();
  }

  static getOne<R>(from: Query.Function<R>){
    return new this(from).getOne(false);
  }

  static find<R>(from: Query.Function<R>){
    return new this(from).getOne(true);
  }

  connection?: Connection;
  mode: Query.Mode = "query";
  selects = new Map<Field, number | string>();
  clauses = new Set<string>();
  tables = new Map<any, Query.Table>();
  limit?: number;
  map?: () => R;
  rawFocus!: { [alias: string]: any };

  constructor(from: Query.Function<R>){
    const select = from(this) as any;

    switch(typeof select){
      case "function":
        this.mode = "select";
        this.map = select as () => R;
        select();
      break;

      case "object": 
        this.map = factory(this, select);
      break;
    }

    this.mode = "fetch";
  }

  async get(limit?: number): Promise<R[]> {
    if(typeof limit == "number")
      if(this.limit! < limit)
        throw new Error(`Limit of ${this.limit} is already defined in query.`);
      else
        this.limit = limit;

    const sql = String(this);

    if(!this.connection)
      throw new Error("Query has no connection, have you setup entities?");

    return this.hydrate(
      await this.connection.query(sql)
    ); 
  }
  
  async getOne(orFail: false): Promise<R | undefined>;
  async getOne(orFail?: boolean): Promise<R>;
  async getOne(orFail?: boolean){
    const results = await this.get(1);

    if(results.length < 1 && orFail)
      throw new Error("No result found.");

    return results[0];
  }
  
  async find(orFail: true): Promise<R>;
  async find(orFail?: boolean): Promise<R | undefined>;
  async find(orFail?: boolean){
    return this.getOne(orFail || false);
  }

  equal = (value: any, isEqualTo: any) => {
    this.where(value, isEqualTo, "=");
  }

  notEqual = (value: any, notEqualTo: any) => {
    this.where(value, notEqualTo, "<>");
  }

  greater = (value: any, than: any) => {
    this.where(value, than, ">");
  }

  less = (value: any, than: any) => {
    this.where(value, than, "<");
  }

  from = <T extends Entity>(
    entity: Entity.Type<T>
  ): Query.Fields<T> => {
    let { name, schema, connection } = entity.table;
    let alias: string | undefined;

    this.connection = connection;

    if(schema){
      name = qualify(schema, name);
      alias = "$0"
    }

    return this.proxy(entity, { name, alias });
  }

  join: Query.JoinFunction = (entity, mode) => {
    let { name, schema } = entity.table;
    let alias: string | undefined;

    if(schema){
      name = qualify(schema, name);
      alias = `$${this.tables.size}`;
    }

    return this.proxy(entity, {
      join: mode || "inner",
      name,
      alias,
      on: []
    });
  }

  hydrate(raw: any[]){
    const results = [] as R[];
    
    if(this.map)
      for(const row of raw){
        this.rawFocus = row;
        results.push(this.map());
      }

    return results;
  }

  proxy(entity: Entity.Type, metadata?: Query.Table){
    const proxy = {} as any;

    if(metadata)
      this.tables.set(proxy, metadata);

    entity.table.fields.forEach((field, key) => {
      field = Object.create(field);

      if(metadata)
        Metadata.set(field, metadata);

      Object.defineProperty(proxy, key, {
        get: field.proxy(this)
      })
    })

    return proxy;
  }

  where(
    left: Field,
    right: string | number | Field,
    op: string
  ){
    const { alias, name, on } = Metadata.get(left)!;

    if(left.set && typeof right !== "object")
      right = left.set(right);

    const column = qualify(alias || name, left.column);

    if(typeof right == "object"){
      const { alias, name } = Metadata.get(right)!;
      const ref = qualify(alias || name, left.column);
      const joinOn = on;

      if(joinOn)
        joinOn.push(`${column} ${op} ${ref}`);
    }
    else {
      if(typeof right === "string")
        right = escapeString(right);
        
      this.clauses.add(`${column} ${op} ${right}`);
    }
  }

  toString(): string {
    return stringify(this);
  }
}

function factory(on: Query, selection: any){
  if(selection instanceof Field){
    const column = on.selects.size + 1;
    on.selects.set(selection, column);

    return () => on.rawFocus[column];
  }

  const desc = Object.getOwnPropertyDescriptors(selection);

  for(const key in desc){
    const { value } = desc[key];

    if(!(value instanceof Field))
      continue;

    on.selects.set(value, key);
  }

  return () => {
    const output = Object.create(selection);
    const raw = on.rawFocus;

    on.selects.forEach(column => {
      output[column] = raw[column];
    })
    
    return output;
  }
}

export default Query;