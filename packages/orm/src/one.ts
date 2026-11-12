import { DataTypes, Exact, field, Has, OptionsOf, PEEK, presets } from "./fields";
import { configure, Field, Nullable, underscore } from './Field';
import type { Builder } from './query/Builder';
import Type, { adopt } from "./Type";

const ONE = new WeakMap<Type.Class, Map<Type.Class, Field | null>>();

class OneToOneField<T extends Type = Type> extends Field {
  declare type: one.DataType;
  declare entity: Type.Class<T>;
  declare onDelete?: string;
  declare onUpdate?: string;
  lazy = false;

  use(query: Builder){
    const table = query.use(this.entity, this.nullable) as Record<string, Field>;
    query.where(table.id, "=", this);
    return table;
  }

  get(id: string | number){
    const Class = this.entity;
    
    if (id == null)
      if(this.nullable)
        return undefined;
      else
        throw new Error(`Missing required relation: ${Class.name}`);

    return this.lazy ? id : this.load(id);
  }

  load(id: string | number){
    const Class = this.entity;

    return adopt(Class, id).catch((err: unknown) => {
      if(err instanceof Error)
        err.message = `Failed to load relation ${Class.name} for ${this.key}: ${err.message}`;

      throw err;
    });
  }

  set(
    value: Type.Instance<T> | Type.Insert<T> | string | number | null | undefined,
    compare?: boolean): any {

    const { entity: Class, column, query } = this;

    if (value == null)
      if(this.nullable)
        return null;
      else
        throw new Error(`Missing required relation: ${Class.name}`);

    if (query?.tables.has(value))
      return (value as any).id;

    if(value instanceof Class){
      const id = value.get("id", false);

      if (id == null)
        throw new Error(`Cannot assign unsaved ${Class.name} to ${column}`);

      return id;
    }

    if(typeof value === "object"){
      if ((value as any).id != null)
        return (value as any).id;

      if (query)
        throw new Error(`Relation ${this} takes an entity, id or table in a query.`);

      const got = compare
        ? Class.query(value as Type.Query<T>, 1).then(([found]) => found)
        : Class.insert(value);

      return got.then(found => found?.id);
    }

    return value;
  }
}

export function getRelated<T extends Type.Class>(Class: T, type: Type.Class) {
  const rel = ONE.get(Class)?.get(type);

  if (rel) return rel.key as keyof Type.Instance<T>;

  const message = rel === null
  ? `There are multiple relationships, you will need to specify which one to use.` 
  : `Did you forget to use one(${Class.name}) in this model?`;

  throw new Error(`No relationship inferred for ${Class.name} in ${type.name}. ${message}`);
}

declare namespace one {
  /** Datatypes `one()` accepts - none; the column takes the related key's datatype. */
  interface Types {}

  /** Name of a registered `one()` datatype. */
  type DataType = DataTypes<Types>;

  /** One option of `one()` - `null`, `lazy`, a datatype, or an object of column options. */
  type Options = OptionsOf<Types, OneToOneField>;

  /** `one` with options preset - same signature, presets after the class. */
  let and: <P extends Options[]>(...preset: P & Exact<P, Types>) => <T extends Type, C extends Options[]>(
    from: Type.Class<T>,
    ...config: C & Exact<C, Types>
  ) => Has<[...P, ...C], Nullable> extends true ? T | undefined : T;
}

/**
 * A relation to one entity of another class, stored as its id.
 *
 * The column is `<property>_id` unless `{ column }` is given. `null` makes it nullable.
 * On an instance it reads the related entity, loaded with its parent - with `lazy`, on first read, suspending. In a row it reads the id.
 * In a `Query` it is the related table, joined - inner when required, left when nullable.
 * A write takes an entity, an id, or an object - with an `id` it is used by it, without one it is inserted as a new related row.
 * A filter takes the same; an object without `id` matches by its fields.
 * `{ onDelete, onUpdate }` set the foreign key's actions. The target cannot have a composite key.
 *
 * @example
 * author = one(User);
 * editor = one(User, null, lazy);
 */
function one<T extends Type, C extends one.Options[]>(from: Type.Class<T>, ...config: C & Exact<C, one.Types>){
  return field<Has<C, Nullable> extends true ? T | undefined : T, OneToOneField<T>>(
    (key, parent) => {
      const field = configure(new OneToOneField<T>(key), [{ helper: one, entity: from, column: `${underscore(key)}_id` }, ...config]);
      let rel = ONE.get(parent);

      Object.defineProperty(field, "reference", {
        get: () => {
          const id = from.fields.get("id")!;

          if (id.parts)
            throw new Error(`${parent.name}.${key} cannot relate to ${from.name}, which has a composite key.`);

          return id;
        }
      });

      if (!rel)
        ONE.set(parent, rel = new Map());

      rel.set(from, rel.has(from) ? null : field);

      return field;
    },
    (field, subject, store) => {
      const { key, entity: Class } = field;
      let id: string | number | undefined;
      let pending: string | number | undefined;
      let loading: Promise<unknown> | undefined;
      let failed: unknown;

      function put(value: unknown){
        if (key in store && store[key] === value)
          return;

        store[key] = value;
        subject.set(key as any);
      }

      function settle(request: Promise<unknown>, value?: unknown, error?: unknown){
        if (loading !== request)
          return;

        failed = error;
        put(value);
      }

      return {
        value: undefined,
        get() {
          if (PEEK.has(subject))
            return id ?? (store[key] as Type | undefined)?.id;

          if (failed)
            throw failed;

          if (pending !== undefined) {
            const request = loading = field.load(pending);

            pending = undefined;
            request.then(
              (value) => settle(request, value),
              (error) => settle(request, undefined, error)
            );
          }

          return subject.get(key as any);
        },
        set(next: unknown) {
          id = undefined;
          pending = undefined;
          loading = undefined;
          failed = undefined;

          if (typeof next == "number" || typeof next == "string") {
            const loaded = Class.loaded.get(next);

            if (!loaded) {
              id = pending = next;
              delete store[key];
              subject.set(key as any);
              throw false;
            }

            next = loaded;
          }

          put(next);
          throw false;
        }
      };
    }
  );
}

one.and = presets(one, 1) as typeof one.and;

/** Modifier for `one()` - load the related entity on first read, not with its parent. */
const lazy = { lazy: true };

export { one, lazy };