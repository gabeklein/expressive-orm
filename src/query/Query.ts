import Connection from '../connection/Connection';
import Entity from '../Entity';
import Field from '../Field';
import { stringify } from '../mysql/stringify';
import Table from '../Table';
import { escapeString, qualify } from '../utility';

export const Metadata = new WeakMap<{}, Query.Table>();

declare namespace Query {
  type Join = "left" | "right" | "inner" | "outer";
  type Mode = "query" | "select";

  interface Table {
    name: string;
    join?: Query.Join;
    alias?: string;
    on?: string[];
  }

  type Fields<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null>;
  }

  type Maybe<T extends Entity> = {
    [K in Entity.Field<T>]: Exclude<T[K], null> | undefined;
  }

  type Select<R> = (where: Query.Where) => R | (() => R);

  interface Where {
    equal(value: any, to: any): void;
    notEqual(value: any, to: any): void;
    greater(value: any, than: any): void;
    less(value: any, than: any): void;
    from<T extends Entity>(entity: Entity.Type<T>): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode?: "right" | "inner"): Query.Fields<T>;
    join<T extends Entity>(from: Entity.Type<T>, mode: Query.Join): Query.Maybe<T>;
  }
}

class Query<R = any> {
  static get<R>(from: Query.Select<R>){
    return this.select(from).get();
  }

  static getOne<R>(from: Query.Select<R>){
    return this.select(from).getOne(false);
  }

  static find<R>(from: Query.Select<R>){
    return this.select(from).getOne(true);
  }

  static select<R>(from: Query.Select<R>){
    const query = new this();

    query.state = "query";
    const select = from(query.interface);

    switch(typeof select){
      case "function": {
        query.state = "select";
        query.map = select as () => R;
        (select as () => R)();
      } break;

      case "object": 
        query.map = useFactory(query, select);
      break;
    }

    query.state = undefined;

    return query;
  }

  clauses = new Set<string>();
  connection?: Connection;
  interface: Query.Where;
  limit?: number;
  map?: () => R;
  rawFocus!: { [alias: string]: any };
  selects = new Map<Field, number | string>();
  source?: Table;
  state?: Query.Mode;
  tables = new Map<any, Query.Table>();

  constructor(){
    const { add, use, where } = this;

    this.interface = {
      equal: where.bind(this, "="),
      notEqual: where.bind(this, "<>"),
      greater: where.bind(this, ">"),
      less: where.bind(this, "<"),
      from: use.bind(this),
      join: add.bind(this)
    }
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

  use<T extends Entity>(
    entity: Entity.Type<T>): Query.Fields<T>{

    let { name, schema, connection } = entity.table;
    let alias: string | undefined;

    this.source = entity.table;
    this.connection = connection;

    if(schema){
      name = qualify(schema, name);
      alias = "$0"
    }

    return this.proxy(entity, { name, alias });
  }

  add<T extends Entity>(
    entity: Entity.Type<T>, mode?: Query.Join){

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

  select(field: Field){
    const column = this.selects.size + 1;
    this.selects.set(field, column);
    return column;
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
        get: field.proxy(this, proxy)
      })
    })

    return proxy;
  }

  where(
    op: string,
    left: Field,
    right: string | number | Field
  ){
    const { alias, name, on } = Metadata.get(left)!;

    if(left.set && typeof right !== "object")
      right = left.set(right);

    const column = qualify(alias || name, left.column);

    if(typeof right == "object"){
      const { alias, name } = Metadata.get(right)!;
      const ref = qualify(alias || name, right.column);
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
    if(this.source)
      this.source.focus = undefined;

    return stringify(this);
  }
}

function useFactory(on: Query, selection: any){
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