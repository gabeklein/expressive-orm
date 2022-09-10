import Connection from "./connection/Connection";
import Entity from "./Entity";
import Field from "./Field";
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
    (this: Where<T>, thisArg: Where<T>) => void;

  export type SelectFunction<T extends Entity, R> =
    (this: Select<T>, thisArg: Select<T>) => R;

  export type Options<T extends Entity, R> = {
    where?: WhereFunction<T>;
    select?: SelectFunction<T, R>;
  }

  type WhereClause<T> =
    T extends Field.Assertions<infer A> ? A : never;

  export type Where<T extends Entity> = {
    [K in Entity.Field<T>]: WhereClause<T[K]>;
  }

  export type WhereObject<T extends Entity> = {
    [K in Entity.Field<T>]?: WhereField<T[K]>
  }

  export type WhereField<T> =
    T extends number | string | boolean
      ? T | T[]
      : never;

  type SelectClause<T> =
    T extends Field.Selects<infer A> ? A : never;

  export type Select<T extends Entity> = {
    [K in Entity.Field<T>]: SelectClause<T[K]>
  }
}

class Query<R = any> {
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
  
  async findOne(orFail: true): Promise<R>;
  async findOne(orFail?: boolean): Promise<R | undefined>;
  async findOne(orFail?: boolean){
    return this.getOne(orFail || false);
  }

  from<T extends Entity>(entity: Entity.Type<T>): Query.Where<T> {
    this.connection = entity.table.connection;

    return this.proxy(entity, {
      name: entity.name
    });
  }

  join<T extends Entity>(
    entity: Entity.Type<T>,
    mode?: Query.Join){
    
    return this.proxy(entity, {
      join: mode || "inner",
      name: entity.name,
      on: []
    });
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
    right: string | number | {},
    op: string
  ){
    if(!(left instanceof Field))
      return;

    const meta = Metadata.get(left)!;

    if(left.set && typeof right !== "object")
      right = left.set(right);

    const column = qualify(meta.name, left.column);

    if(typeof right == "object"){
      const info = Metadata.get(right)!;
      const ref = qualify(info.name, left.column);
      const joinOn = meta.on;

      if(joinOn)
        joinOn.push(`${column} ${op} ${ref}`);
    }
    else {
      if(typeof right === "string")
        right = escapeString(right);
        
      this.where.add(`${column} ${op} ${right}`);
    }
  }

  toString(){
    const { selects, where, tables } = this;
    const lines = [] as string[];

    if(selects.size){
      lines.push(
        "SELECT",
        map(this.selects, clause => `\t${clause}`).join(",\n")
      )
    }

    const [ from, ...joins ] = tables.values();

    if(from.join)
      throw new Error(`Table ${from.name} is joined but main table must be declared first.`);

    lines.push(`FROM \`${from.name}\``);

    for(const table of joins){
      const type = table.join!.toUpperCase();
      const join = `${type} JOIN ${qualify(table.name)}`;
      const on = `\n\tON ${table.on!.join("\n\tAND ")}`;

      lines.push(join + on);
    }

    if(where.size)
      lines.push(
        "WHERE\n\t" + [...where].join(" AND\n\t")
      );

    return lines.join("\n");
  }
}

function map<T, R>(
  iterable: Map<any, T> | Set<T> | T[],
  mapFn: (value: T) => R){

  const output = [] as R[];

  iterable.forEach(value => {
    output.push(mapFn(value));
  })

  return output;
}

export default Query;