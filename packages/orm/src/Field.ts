import type { Builder } from './query/Builder';
import type { Query } from './query/Query';

export type Async<T> = T | Promise<T>;

export type Nullable<T extends Field = Field> = null | Partial<T> & { nullable: true }

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

    for (const opt of opts) {
      if (opt === null) {
        this.nullable = true;
      } else if (typeof opt === 'object') {
        Object.assign(this, opt);
      }
    }
  }

  get property() {
    return this.key;
  }

  get datatype() {
    return this.type;
  }

  use?(query: Builder): unknown;

  set(this: Field, value: any, compare?: boolean): Async<string | number | null | undefined> {
    return value;
  }

  get(this: Field, value: any, from?: Record<string, any>): Async<T> {
    return value;
  }

  async apply(update: Record<string, string>, from: Record<string, any>, partial?: boolean) {
    const { key, column, nullable, optional } = this;
    const allowMissing = optional || nullable || partial;
    let value = from[key];

    if (value === undefined && allowMissing)
      return;

    value = await this.set(value);

    if (value == null && !nullable)
      throw new Error(`Missing required field: ${key}`);

    update[column] = value;
  }
}

export function underscore(str: string) {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
