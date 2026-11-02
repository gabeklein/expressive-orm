import type { Builder } from './query/Builder';
import type { Query } from './query/Query';

export type Async<T> = T | Promise<T>;

export type Nullable<T extends Field = Field> = null | Partial<T> & { nullable: true }

export type Omissible =
  | { optional: true }
  | { increment: true }
  | { primary: true }
  | { fallback: {} | null };

export type Optional<T> = T & { readonly "~optional"?: true };

export type Omits<V> =
  undefined extends V ? true :
  "~optional" extends keyof NonNullable<V> ? true :
  false;

export type Config<T = Field> = Partial<T> | null | undefined | false;

export class Field<T = unknown> {
  key: string;
  column: string;
  type = "";
  kind?: unknown;
  length?: number;
  nullable = false;
  optional = false;
  unique = false;
  increment = false;
  primary = false;
  absent = false;
  fallback?: unknown;
  reference?: Field;
  parent?: Query.Table;
  table?: Builder.ITable;
  query?: Builder;

  constructor(key: string, ...opts: Config[]) {
    this.key = key;
    this.column = underscore(key);
    configure(this, opts);
  }

  get property() {
    return this.key;
  }

  get datatype() {
    return this.type;
  }

  use?(query: Builder): unknown;

  set(this: Field, value: any, compare?: boolean): Async<string | number | boolean | null | undefined> {
    return value;
  }

  get(this: Field, value: any, from?: Record<string, any>): Async<T | undefined> {
    return value;
  }

  async apply(update: Record<string, string>, from: Record<string, any>, partial?: boolean) {
    const { key, column, nullable } = this;
    let value = from[key];

    if (value === undefined && (nullable || partial || omits(this)))
      return;

    value = await this.set(value);

    if (value == null && !nullable)
      throw new Error(`Missing required field: ${key}`);

    update[column] = value;
  }
}

export function configure<F extends Field>(field: F, opts: Config<any>[]) {
  for (const opt of opts)
    if (opt === null)
      field.nullable = true;
    else if (typeof opt === 'object')
      Object.assign(field, opt);

  return field;
}

export function omits(field: Field) {
  return field.optional || field.increment || field.primary || field.fallback !== undefined;
}

export function underscore(str: string) {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
