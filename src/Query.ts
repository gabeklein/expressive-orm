import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Entity from './Entity';
import Field from './instruction/Field';
import Table from './Table';
import { escape, escapeString } from './utility';

const KNEX = knex({ client: "mysql" });

namespace Query {
  export type WhereFunction<T extends Entity> =
    (this: Where<T>, thisArg: Where<T>) => void;

  export type SelectFunction<T extends Entity, R> =
    (this: Entity.Pure<T>, thisArg: Entity.Pure<T>) => R;

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

  export type Normalize =
    (row: { [select: string]: any }, output: any) => void;

  export type Select<T extends Entity> = Entity.Pure<T>;
}

class Query<T extends Entity, S = unknown> {
  protected builder: Knex.QueryBuilder;

  public table: Table;
  public selects = new Map<string, Query.Normalize>();
  public tables = new Map<Field | undefined, string>();

  constructor(protected type: Entity.Type<T>){
    this.table = type.table;
    this.builder = KNEX.from(type.table.name);
  }

  getTableName(from?: Field){
    return this.tables.get(from) || "";
  }

  join(type: typeof Entity, on: string, foreignKey?: string){
    const foreign = type.table.name;
    const local = this.getTableName();

    // TODO: pull default from actual entity.
    const fk = escape(foreign, foreignKey || "id");
    const lk = escape(local, on);

    this.builder.joinRaw(
      `LEFT JOIN ${escape(foreign)} ON ${fk} = ${lk}`
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
    this.selects.set(name, callback);
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
    const qs = this.builder.toString();

    if(typeof limit == "number")
      this.builder.limit(limit);

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
    const ops = [] as any[];
    const results = raw.map(row => {
      const output = {} as any;

      this.selects.forEach(apply => {
        const maybePromise: unknown = apply(row, output);

        if(maybePromise instanceof Promise)
          ops.push(maybePromise);
      });
      
      return output;
    });

    await Promise.all(ops);
    
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
  select(from: Query.SelectFunction<T, any>){
    const table = this.getTableName();
    const proxy = this.type.map((field, key) => {
      return field.select(this, [key], table);
    })

    from.call(proxy, proxy);

    return this;
  }
}

export default Query;