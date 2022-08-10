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

  export type Where<T extends {}> = {
    [K in Exclude<keyof T, keyof Entity>]: WhereClause<T[K]>;
  } & {
    has(values: Partial<T>): void;
  }

  export type Normalize =
    (row: { [selection: string]: any }, output: any) => void;

  export type Select<T extends Entity> = Entity.Pure<T>;
}

class Query<T extends Entity, S = any> {
  private tableName: string;
  private fields: Map<string, Field>;
  private assertions = new WeakMap<Field>();
  private selects = new Map<string, Query.Normalize>();

  public where = new Set<[string, string, { toString(): string }]>();

  constructor(type: typeof Entity){
    const Type = type as unknown as typeof Entity;
    this.fields = Type.fields;
    this.tableName = Type.tableName;
  }

  print(){
    const qb = this.commit();
    logSQL(qb);
  }

  commit(){
    const builder = KNEX.from(this.tableName);

    for(const clause of this.where)
      builder.whereRaw(clause.join(" "));

    for(const key of this.selects.keys())
      builder.select(key);

    return builder;
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

  assert(field: Field, path: string): any {
    let item = this.assertions.get(field);

    if(!item){
      item = field.assert(path, this);
      this.assertions.set(field, item);
    }

    return item;
  }

  applyQuery(from: Query.WhereFunction<T>){
    const proxy = {} as Query.Where<T>;

    this.fields.forEach((type, key) => {
      Object.defineProperty(proxy, key, {
        get: () => this.assert(type, key)
      })
    })

    from.call(proxy, proxy);
  }

  applySelection(
    from: Query.SelectFunction<T, S>,
    path: string[] = []){

    const proxy = {} as Query.Select<T>;

    this.fields.forEach((type, key) => {
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