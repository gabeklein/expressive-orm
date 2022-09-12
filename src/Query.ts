import Connection from "./connection/Connection";
import Entity from "./Entity";
import Field, { VALUE } from "./Field";
import { stringify } from "./mysql/stringify";
import { escapeString, qualify } from "./utility";

export const Metadata = new WeakMap<{}, Query.Table>();

declare namespace Query {
  export type Function<R> = (query: Query) => () => R;

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
    [K in Entity.Field<T>]:
      T[K] extends { [VALUE]?: infer U } ? U : T[K];
  }

  export type WhereField<T> =
    T extends number | string | boolean
      ? T | T[]
      : never;

  type SelectClause<T> =
    T extends Field.Value<infer A> ? A : never;

  export type Select<T extends Entity> = {
    [K in Entity.Field<T>]: SelectClause<T[K]>
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
  access = new Map<Field, string>();
  selects = new Set<string>();
  where = new Set<string>();
  tables = new Map<any, Query.Table>();
  limit?: number;
  select?: () => R;
  rawFocus!: { [alias: string]: any };

  constructor(from: Query.Function<R>){
    const select = from(this);

    if(typeof select == "function"){
      this.mode = "select";
      this.select = select as () => R;
      select();
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
    this.compare(value, isEqualTo, "=");
  }

  notEqual = (value: any, notEqualTo: any) => {
    this.compare(value, notEqualTo, "<>");
  }

  greater = (value: any, than: any) => {
    this.compare(value, than, ">");
  }

  less = (value: any, than: any) => {
    this.compare(value, than, "<");
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

    const table: Query.Table = { name, alias }

    

    return this.proxy(entity, table);
  }

  joins = <T extends Entity>(
    entity: Entity.Type<T>,
    mode?: Query.Join
  ): Query.Fields<T> => {
    let { name, schema } = entity.table;
    let alias: string | undefined;

    if(schema){
      name = qualify(schema, name);
      alias = `$${this.tables.size}`;
    }

    const table: Query.Table = {
      join: mode || "inner",
      name,
      alias,
      on: []
    }

    return this.proxy(entity, table);
  }

  hydrate(raw: any[]){
    const results = [] as R[];
    
    if(this.select)
      for(const row of raw){
        this.rawFocus = row;
        results.push(this.select());
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

  compare(
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
        
      this.where.add(`${column} ${op} ${right}`);
    }
  }

  toString(): string {
    return stringify(this);
  }
}

export default Query;