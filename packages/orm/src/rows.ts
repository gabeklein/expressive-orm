import { def } from "@expressive/mvc";

import { getRelated } from "./one";
import Type, { newest } from "./Type";

type Related<T> = {
  [K in Exclude<keyof T, keyof Type>]-?: T[K] extends Type | undefined ? K : never;
}[Exclude<keyof T, keyof Type>];

/** A `rows()` field - `query`, `load`, `one` and `insert` scoped to the entity, `insert` filling the relation. */
interface Rows<T extends Type, K extends keyof T> {
  query(where?: Type.Query<T>, limit?: number, offset?: number): Promise<Type.Columns<T>[]>;
  load(where?: Type.Query<T>, limit?: number, offset?: number): Promise<T[]>;
  one(where?: Type.Query<T>, expect?: true): Promise<T>;
  one(where: Type.Query<T> | undefined, expect: boolean): Promise<T | undefined>;
  insert(data: Omit<Type.Insert<T>, K> & Partial<Type.Insert<T>>): Promise<Type.Columns<T>>;
}

/**
 * The rows of another class that relate to this entity - `query`, `load`, `one` and `insert` scoped to it.
 *
 * Finds the `one()` on `Class` pointing here; name it with `field` when there is more than one.
 * Not a column - nothing loads until a method is called. Without a filter, `query()`, `load()` and `one()` take the newest first, as `Class` orders.
 *
 * @example
 * posts = rows(Post);
 */
function rows<T extends Type, K extends keyof T = Related<T>>(Class: Type.Class<T>, field?: K){
  return def((key, subject: Type) => {
    let handle: Rows<T, K> | undefined;

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
          query: (where, limit, offset) => Class.query(scope(where), limit, offset),
          load: (where, limit, offset) => Class.load(scope(where), limit, offset),
          one: (where?: Type.Query<T>, expect?: boolean) => Class.one(scope(where), expect as true),
          insert: (data) => Class.insert({ ...data, [fk]: id } as Type.Insert<T>)
        };
      }
    };
  }) as Rows<T, K>;
}

export { rows };
export type { Rows };
