import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Entity from './Entity';
import Field from './instruction/Field';
import Definition from './Definition';
import { qualify, escapeString } from './utility';

const KNEX = knex({ client: "mysql" });

namespace Query {
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

  export type Where<T extends {}> =
    & { [K in Exclude<keyof T, keyof Entity>]: WhereClause<T[K]> }
    & {
      has(values: Partial<T>): void;
    }

  type SelectClause<T> =
    T extends Field.Selects<infer A> ? A : never;

  export type Select<T extends Entity> = {
    [K in Exclude<keyof T, keyof Entity>]: SelectClause<T[K]>
  }

  export type Normalize =
    (row: { [select: string]: any }, output: any) => void;
}

class Query<T extends Entity, S = unknown> {
  protected builder: Knex.QueryBuilder;

  public table: Definition;
  public selects = new Set<Query.Normalize>();
  public tables = new Map<Field | undefined, string>();

  constructor(protected type: Entity.Type<T>){
    const { name, schema } = type.table;
    const from = schema ? `${schema}.${name}` : name;

    this.table = type.table;
    this.builder = KNEX.from(from);
  }

  // TODO: include per-field translation
  mapper(idenity: any){
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
    if(typeof limit == "number")
      this.builder.limit(limit);

    const qs = this.builder.toString();

    return this.table.connection!.query(qs);
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

      return this.mapper(output);
    });

    await Promise.all(pending);
    
    return results;
  }

  where(from: Query.WhereFunction<T>){
    const table = this.getTableName();
    const proxy = this.type.map((field) => {
      return field.where(this, table);
    });

    from.call(proxy, proxy);

    return this;
  }

  select<R>(from: Query.SelectFunction<T, R>): Query<T, R>;
  select(from: Query.SelectFunction<T, S>): this;
  select(from: "*"): Query<T, Query.Select<T>>;
  select(from: "*" | Query.SelectFunction<T, any>): Query<T, any> {
    const table = this.getTableName();
    const proxy = this.type.map((field, key) => {
      return field.select(this, [key], table);
    })

    if(typeof from == "string"){
      Object.getOwnPropertyNames(proxy).map(key => {
        void proxy[key];
      })

      this.mapper = x => x;
    }
    else {
      from.call(proxy, proxy);
      this.mapper = from;
    }

    return this;
  }
}

export default Query;