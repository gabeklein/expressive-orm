import { DataTypes, Exact, field, Has, OptionsOf, PEEK } from "./fields";
import { configure, Field, Nullable } from './Field';
import type { Builder } from './query/Builder';
import Type from "./Type";

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

    return Class.one(id, false).catch((err: unknown) => {
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
      const id = (value as any).id;

      if (id == null)
        throw new Error(`Cannot assign unsaved ${Class.name} to ${column}`);

      return id;
    }

    if(typeof value === "object"){
      if (query)
        throw new Error(`Relation ${this} takes an entity, id or table in a query.`);

      const got = compare
        ? Class.one(value as any, false)
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
  interface Types {}

  type DataType = DataTypes<Types>;

  type Options = OptionsOf<Types, OneToOneField>;
}

function one<T extends Type, C extends one.Options[]>(from: Type.Class<T>, ...config: C & Exact<C, one.Types>){
  return field<Has<C, Nullable> extends true ? T | undefined : T, OneToOneField<T>>(
    (key, parent) => {
      const field = configure(new one.Type<T>(key), [{ entity: from, column: `${from.table}_id` }, ...config]);
      let rel = ONE.get(parent);

      Object.defineProperty(field, "reference", {
        get: () => from.fields.get("id")
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

one.Type = OneToOneField;

const lazy = { lazy: true };

export { one, lazy };