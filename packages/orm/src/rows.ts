import { def, has } from "@expressive/mvc";
import { listener } from "@expressive/mvc/observable";

import { getRelated } from "./one";
import Type, { newest } from "./Type";

type Related<T> = {
  [K in Exclude<keyof T, keyof Type>]-?: T[K] extends Type | undefined ? K : never;
}[Exclude<keyof T, keyof Type>];

/**
 * A `rows()` field - every related entity, newest first, as a live `has.List`, with `query`, `load`, `one` and `insert` scoped to the entity.
 *
 * Loads on first await or first read - a read before then suspends, throwing the load's promise. Awaiting it again resolves the same list.
 * An entity added by `insert` joins it first; one deleted or destroyed leaves it. Nothing else changes it - other writes show in `load()` or `query()`.
 */
interface Rows<T extends Type, K extends keyof T> extends has.List<T> {
  query(where?: Type.Query<T>, limit?: undefined, offset?: number): Promise<Type.Columns<T>[]>;
  query(where: Type.Query<T> | undefined, limit: number, offset?: number): Type.Results<T>;
  query(where: Type.Query<T> | undefined, limit: number | undefined, offset?: number): Promise<Type.Columns<T>[]>;
  /** Related entities matching a filter, as `Class.load` resolves them - an array, read once. */
  load(where?: Type.Query<T>, limit?: number, offset?: number): Promise<T[]>;
  one(where?: Type.Query<T>, expect?: true): Promise<T>;
  one(where: Type.Query<T> | undefined, expect: boolean): Promise<T | undefined>;
  /**
   * Insert a related row with the foreign key filled, as `Class.new` does - the entity at once, awaitable.
   *
   * Once stored, it joins this list first - when the list has loaded or is loading.
   *
   * @example
   * const post = await user.posts.insert({ title: "Hello" });
   */
  insert(data: Omit<Type.Insert<T>, K> & Partial<Type.Insert<T>>): Type.Async<T>;
}

interface State {
  loaded: boolean;
  loading?: Promise<void>;
  start(): Promise<void>;
}

const STATE = new WeakMap<object, State>();

function ready(from: object) {
  const state = STATE.get(from) || STATE.get(Object.getPrototypeOf(from))!;

  if (!state.loaded)
    throw state.start();
}

class Relation<T> extends has.List<T> {
  get size() {
    ready(this);
    return super.size;
  }

  get(...args: any[]): any {
    ready(this);
    return (super.get as Function).apply(this, args);
  }

  [Symbol.iterator]() {
    ready(this);
    return super[Symbol.iterator]();
  }
}

/**
 * The rows of another class that relate to this entity - a live list of them, with `query`, `load`, `one` and `insert` scoped to it.
 *
 * Finds the `one()` on `Class` pointing here; name it with `field` when there is more than one.
 * Not a column. Without a filter, `query()`, `load()` and `one()` take the newest first, as `Class` orders.
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
        const list = new Relation<T>() as Rows<T, K>;
        const watched = new WeakSet<T>();

        const state: State = {
          loaded: false,
          start() {
            return state.loading ||= Class.load(scope()).then(items => {
              state.loaded = true;
              items.forEach(item => add(item));
              delete (list as any).then;
            }, error => {
              state.loading = undefined;
              throw error;
            });
          }
        };

        function add(entity: T, first?: boolean) {
          if (!watched.has(entity)) {
            watched.add(entity);
            listener(entity, () => remove(list, entity), null);
          }

          if (!list.any(item => item === entity))
            first ? list.put(0, entity) : list.push(entity);
        }

        STATE.set(list, state);

        Object.defineProperties(list, {
          query: { value: (where?: Type.Query<T>, limit?: number, offset?: number) => Class.query(scope(where), limit, offset) },
          load: { value: (where?: Type.Query<T>, limit?: number, offset?: number) => Class.load(scope(where), limit, offset) },
          one: { value: (where?: Type.Query<T>, expect?: boolean) => Class.one(scope(where), expect as true) },
          insert: {
            value(data: object) {
              const entity: Type.Async<T> = (Class.new as Function).call(Class, { ...data, [fk]: id });

              entity.get(() => {}).then(() => {
                if (state.loaded)
                  add(entity, true);
                else if (state.loading)
                  state.loading.then(() => add(entity, true), () => {});
              }, () => {});

              return entity;
            }
          },
          then: {
            configurable: true,
            value(resolve?: (value: Rows<T, K>) => unknown, reject?: (reason: unknown) => unknown) {
              return state.start().then(() => list).then(resolve, reject);
            }
          }
        });

        return handle = list;
      }
    };
  }) as Type.Async<Rows<T, K>>;
}

function remove(list: has.List<unknown>, entity: unknown) {
  let index = 0;

  for (const item of list) {
    if (item === entity) {
      list.pop(index);
      return;
    }

    index++;
  }
}

export { rows };
export type { Rows };
