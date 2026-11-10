import { def } from "@expressive/mvc";

import { getRelated } from "./one";
import Type from "./Type";
import { desc } from "./where";

type Related<T> = {
  [K in Exclude<keyof T, keyof Type>]-?: T[K] extends Type | undefined ? K : never;
}[Exclude<keyof T, keyof Type>];

/** A `rows()` field - `find`, `one` and `insert` scoped to the entity, `insert` filling the relation. */
interface Rows<T extends Type, K extends keyof T> {
  find(where?: Type.Query<T>, limit?: number, offset?: number): Promise<Type.Columns<T>[]>;
  one(where?: Type.Query<T>, expect?: true): Promise<Type.Columns<T>>;
  one(where: Type.Query<T> | undefined, expect: boolean): Promise<Type.Columns<T> | undefined>;
  insert(data: Omit<Type.Insert<T>, K> & Partial<Type.Insert<T>>): Promise<Type.Columns<T>>;
}

/**
 * The rows of another class that relate to this entity - `find`, `one` and `insert` scoped to it.
 *
 * Finds the `one()` on `Class` pointing here; name it with `field` when there is more than one.
 * Not a column - nothing loads until a method is called. `find()` and `one()` without a filter take the newest first.
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

        const scope = (where?: object): any => ({ ...where || { id: desc() }, [fk]: id });

        return handle = {
          find: (where, limit, offset) => Class.find(scope(where), limit, offset),
          one: (where?: Type.Query<T>, expect?: boolean) => Class.one(scope(where), expect as true),
          insert: (data) => Class.insert({ ...data, [fk]: id } as Type.Insert<T>)
        };
      }
    };
  }) as Rows<T, K>;
}

export { rows };
export type { Rows };
