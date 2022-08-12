import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Field from './columns/Field';
import Entity from './Entity';

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
    (row: { [selection: string]: any }, output: any) => void;

  export type Select<T extends Entity> = Entity.Pure<T>;
}

class Query<T extends Entity, S = any> {
  public builder: Knex.QueryBuilder;
  public selects = new Map<string, Query.Normalize>();

  constructor(private type: typeof Entity){
    this.builder = KNEX.from(type.tableName);
  }

  toString(){
    return format(this.builder.toString());
  }

  where(...args: any[]){
    this.builder.whereRaw(args.join(" "));
  }

  select(name: string, path: string[]){
    this.builder.select(name);
    this.selects.set(name, (from, to) => {
      const key = path.pop()!;

      for(const key of path)
        to = to[key];

      to[key] = from[key];
    })
  }
  
  async get(limit: number){
    if(limit)
      this.builder.limit(limit);

    const results = [] as any[];

    return results.map(row => {
      const item = {} as any;

      this.selects.forEach(apply => {
        apply(row, item);
      });
      
      return item;
    });
  }

  applyQuery(from: Query.WhereFunction<T>){
    const proxy = this.type.map((key, type) => {
      return type.touch(this, key)
    });

    from.call(proxy, proxy);
  }

  applySelection(
    from: Query.SelectFunction<T, S>,
    path: string[] = []){

    const proxy = this.type.map((key, type) => {
      return this.select(type.name, [...path, key])
    })

    from.call(proxy, proxy);
  }
}

export default Query;