import Field from '../columns/Field';
import Entity from '../Entity';

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

abstract class Query<T extends Entity, S = any> {
  fields: Map<string, Field>;
  selects = new Map<string, Query.Normalize>();
  where = new Set<[string, string, { toString(): string }]>();

  constructor(type: typeof Entity){
    const Type = type as unknown as typeof Entity;
    this.fields = Type.fields;
  }

  abstract print(): void;
  abstract get(limit?: number): Promise<S[]>;

  applyQuery(from: Query.WhereFunction<T>){
    const proxy = {} as Query.Where<T>;

    for(const [ key, field ] of this.fields)
      Object.defineProperty(proxy, key, {
        get: () => field.assert(key, this)
      });

    from.call(proxy, proxy);
  }

  applySelection(from: Query.SelectFunction<T, S>){
    const proxy = createProxy<T>(this.selects, this.fields, []);

    from.call(proxy, proxy);
  }
}

function createProxy<T extends Entity>(
  selects: Map<string, Query.Normalize>,
  fields: Map<string, Field>,
  path: string[]){

  const proxy = {} as Query.Select<T>;

  for(const [key, { name }] of fields)
    Object.defineProperty(proxy, key, {
      get: () => {
        selects.set(name, (from, to) => {
          for(const key of path)
            to = to[key];

          to[key] = from[name];
        })
      }
    });

  return proxy;
}

export default Query;