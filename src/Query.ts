import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Entity from './Entity';
import Field from './Field';
import Table from './Table';
import { qualify, escapeString } from './utility';

const KNEX = knex({ client: "mysql" });

export namespace Join {
  export type Mode = "left" | "right" | "inner" | "outer";

  type WhereClause<T> =
    T extends Field.Assertions<infer A> ? A : never;

  export type Where<T extends Entity> = {
    [K in Entity.Field<T>]: WhereClause<T[K]>;
  }

  export type Used = {
    [name: string]: Where<Entity>;
  }
}

namespace Query {
  export type WhereFunction<T extends Entity, R = any> =
    (this: Where<T>, thisArg: Where<T>) => R | void;

  export type SelectFunction<T extends Entity, R, J = {}> =
    (this: Select<T>, thisArg: Select<T>, joins: J) => R;

  export type Options<T extends Entity, R, I> = {
    where?: WhereFunction<T, I>;
    select?: SelectFunction<T, R, I>;
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

  export type Normalize =
    (row: { [select: string]: any }, output: any) => void;
}

class Query<T extends Entity, S = unknown> {
  protected builder: Knex.QueryBuilder;

  public table: Table;
  public selects = new Set<Query.Normalize>();
  public tables = new Map<Field | undefined, string>();

  constructor(protected type: Entity.Type<T>){
    const { name, schema } = type.table;
    const from = schema ? `${schema}.${name}` : name;

    this.table = type.table;
    this.builder = KNEX.from(from);
  }

  config<R, I>(from: Query.Options<T, R, I>){
    const { where, select } = from;
    let pass = {} as I;

    if(where){
      const table = this.getTableName();
      const proxy = this.type.map((field) => {
        return field.where(this, table);
      });

      const output = where.call(proxy, proxy);

      if(typeof output == "object")
        pass = output;
    }

    if(typeof select == "function")
      this.select(proxy => {
        return select.call(proxy, proxy, pass);
      });
    else
      this.select("*" || select);
    
    return this as unknown as Query<T, R>;
  }

  // TODO: include per-field translation
  mapper(idenity: any, joins: any){
    return idenity;
  }

  getTableName(from?: Field){
    return this.tables.get(from) || "";
  }

  join(type: typeof Entity, on: string, foreignKey?: string){
    const foreign = type.table.name;
    const local = this.getTableName();

    // TODO: pull default from actual entity.
    const fk = qualify(foreign, foreignKey || "id");
    const lk = qualify(local, on);

    this.builder.joinRaw(
      `LEFT JOIN ${qualify(foreign)} ON ${fk} = ${lk}`
    )

    return foreign;
  }

  toString(){
    return format(this.builder.toString());
  }

  addWhere(a: any, b: any, c: any){
    this.builder.whereRaw(`${a} ${b} ${c}`);
  }

  addSelect(name: string, callback: Query.Normalize){
    this.builder.select(name);
    this.selects.add(callback);
  }

  compare(
    left: Field | string,
    right: string | number | Field,
    op: string){
  
    if(typeof right === "string")
      right = escapeString(right);
    
    this.builder.whereRaw(
      `${left.toString()} ${op} ${right.toString()}`
    );
  }

  async fetch(limit?: number){
    const { connection } = this.table;

    if(!connection)
      throw new Error(`${this.type.name} has no connection. Is it initialized?`);

    if(typeof limit == "number")
      this.builder.limit(limit);

    return connection.query(
      this.builder.toString()
    );
  }
  
  async get(limit?: number): Promise<S[]> {
    return this.hydrate(
      await this.fetch(limit)
    );
  }
  
  async getOne(orFail: false): Promise<S | undefined>;
  async getOne(orFail?: boolean): Promise<S>;
  async getOne(orFail?: boolean){
    const results = await this.fetch(1);

    if(results.length < 1 && orFail)
      throw new Error("No result found.");

    const output = await this.hydrate(results);

    return output[0];
  }
  
  async findOne(orFail: true): Promise<S>;
  async findOne(orFail?: boolean): Promise<S | undefined>;
  async findOne(orFail?: boolean){
    return this.getOne(orFail || false);
  }

  async hydrate(raw: any[]){
    const pending = [] as Promise<void>[];
    const results = raw.map(row => {
      const output = {};

      for(const apply of this.selects){
        const maybeAsync = apply(row, output) as unknown;

        if(maybeAsync instanceof Promise)
          pending.push(maybeAsync);
      }

      return this.mapper.call(output, output, {});
    });

    await Promise.all(pending);
    
    return results;
  }

  where(from: Query.WhereFunction<T> | Query.WhereObject<T>){
    const { fields } = this.type.table;
    const table = this.getTableName();

    if(typeof from == "object"){
      for(const key in from){
        const field = fields.get(key);

        if(!field)
          continue;

        const ref = qualify(table!, field.column);
        this.compare(ref, (from as any)[key], "=");
      }
    }
    else {
      const proxy = this.type.map((field) => {
        return field.where(this, table);
      });
  
      from.call(proxy, proxy);
    }

    return this;
  }

  select<R>(from: Query.SelectFunction<T, R>): Query<T, R>;
  select(from: Query.SelectFunction<T, S>): this;
  select<K extends Entity.Field<T>>(fields: K[]): Query<T, Pick<Query.Select<T>, K>>;
  select(from: "*"): Query<T, Query.Select<T>>;
  select(from: "*" | string[] | Query.SelectFunction<T, any>): Query<T, any> {
    const table = this.getTableName();
    const proxy = this.type.map((field, key) => {
      return field.select(this, [key], table);
    })

    if(from == "*"){
      Object.getOwnPropertyNames(proxy).forEach(key => proxy[key])
      this.mapper = x => x;
    }
    else if(typeof from == "function"){
      from.call(proxy, proxy, {});
      this.mapper = from;
    }
    else if(Array.isArray(from))
      from.forEach(key => proxy[key])

    return this;
  }
}

export default Query;