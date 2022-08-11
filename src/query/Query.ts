import knex, { Knex } from 'knex';
import { format } from 'sql-formatter';

import Field from '../columns/Field';
import Entity from '../Entity';

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
  public selects = new Map<string, Query.Normalize>();
  public builder: Knex.QueryBuilder;

  constructor(private type: typeof Entity){
    this.builder = KNEX.from(type.tableName);
  }

  where(...args: any[]){
    this.builder.whereRaw(args.join(" "));
  }

  print(){
    const qb = this.commit();
    logSQL(qb);
  }

  commit(){
    for(const key of this.selects.keys())
      this.builder.select(key);

    return this.builder;
  }

  select(key: string){
    this.builder.select(key)
  }
  
  async get(limit: number){
    const qb = this.commit();

    if(limit)
      qb.limit(limit);

    logSQL(qb);

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
    const proxy = {} as Query.Where<T>;

    this.type.fields.forEach((type, key) => {
      Object.defineProperty(proxy, key, {
        get: () => type.access(this, key)
      })
    })

    from.call(proxy, proxy);
  }

  applySelection(
    from: Query.SelectFunction<T, S>,
    path: string[] = []){

    const proxy = {} as Query.Select<T>;

    this.type.fields.forEach((type, key) => {
      Object.defineProperty(proxy, key, {
        get: () => {
          const { name } = type;

          this.selects.set(name, (from, to) => {
            for(const key of path)
              to = to[key];

            to[key] = from[name];
          })
        }
      })
    })

    from.call(proxy, proxy);
  }
}

function logSQL(qb: Knex.QueryBuilder){
  return console.log(format(qb.toString()), "\n");
}

export default Query;