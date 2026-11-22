import { def } from "@expressive/mvc";

import { getRelated } from "./one";
import Type, { newest } from "./Type";

type Related<T> = {
  [K in Exclude<keyof T, keyof Type>]-?: T[K] extends Type | undefined ? K : never;
}[Exclude<keyof T, keyof Type>];

/** A `many()` field - `query`, `load`, `one` and `insert` scoped to the entity, `insert` filling the relation. */
interface Many<T extends Type, K extends keyof T> {
  query(where?: Type.Query<T>, limit?: undefined, offset?: number): Promise<Type.Columns<T>[]>;
  query(where: Type.Query<T> | undefined, limit: number, offset?: number): Type.Results<T>;
  query(where: Type.Query<T> | undefined, limit: number | undefined, offset?: number): Promise<Type.Columns<T>[]>;
  load(where?: Type.Query<T>, limit?: number, offset?: number): Promise<T[]>;
  one(where?: Type.Query<T>, expect?: true): Promise<T>;
  one(where: Type.Query<T> | undefined, expect: boolean): Promise<T | undefined>;
  /**
   * Insert a related row with the foreign key filled, as `Class.new` does - the entity at once, awaitable.
   *
   * @example
   * const post = await user.posts.insert({ title: "Hello" });
   */
  insert(data: Omit<Type.Insert<T>, K> & Partial<Type.Insert<T>>): Type.Async<T>;
}

/**
 * The rows of another class that relate to this entity - `query`, `load`, `one` and `insert` scoped to it.
 *
 * Finds the `one()` on `Class` pointing here; name it with `field` when there is more than one.
 * Not a column - nothing loads until a method is called. Without a filter, `query()`, `load()` and `one()` take the newest first, as `Class` orders.
 *
 * @example
 * posts = many(Post);
 */
function many<T extends Type, K extends keyof T = Related<T>>(Class: Type.Class<T>, field?: K){
  return def((key, subject: Type) => {
    let handle: Many<T, K> | undefined;

    return {
      enumerable: false,
      set: false,
      get() {
        if (handle)
          return handle;

        const { fields } = Class;
        const { id } = subject;
        const fk = String(field || getRelated(Class, subject.constructor as Type.Class));

        if (!fields.has(fk))
          throw new Error(`Field ${fk} does not exist on ${Class.name}`);

        const scope = (where?: object): any => ({ ...newest(Class, where), [fk]: id });

        return handle = {
          query: (where?: Type.Query<T>, limit?: number, offset?: number): any => Class.query(scope(where), limit, offset),
          load: (where, limit, offset) => Class.load(scope(where), limit, offset),
          one: (where?: Type.Query<T>, expect?: boolean) => Class.one(scope(where), expect as true),
          insert: (data) => (Class.new as Function).call(Class, { ...data, [fk]: id })
        };
      }
    };
  }) as Many<T, K>;
}

export { many };
export type { Many };
