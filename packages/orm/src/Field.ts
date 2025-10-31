import type { Type } from './Type';

export type Async<T> = T | Promise<T>;
export type MaybeLazy<T> = T | Promise<T> | (() => Async<T>);

/**
 * Field configuration options.
 * 
 * May be null, false, or undefined to skip where some options are conditional.
 */
export type Config<T = Field> = Partial<T> | undefined | null | false;

export class Field {
  key: string;
  column: string;
  nullable = false;
  optional = false;
  type?: unknown;

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

  set(this: Field, value: any, compare?: boolean): Async<string | number | null | undefined> {
    return value;
  }

  get(this: Field, value: any, from: Record<string, any>): MaybeLazy<unknown> {
    return value;
  }

  parse(this: Field, into: Type & Record<string, any>, raw: Record<string, any>): Async<void> {
    const value = this.get(raw[this.column], raw);
    const assign = (value: any) => {
      Object.defineProperty(into, this.key, { value, configurable: true });
      return value;
    };

    if (value instanceof Function) {
      let promise: Promise<any> | undefined;

      Object.defineProperty(into, this.key, {
        configurable: true,
        get() {
          if (promise instanceof Promise)
            throw promise;

          const result = value();

          if (result instanceof Promise)
            throw promise = result.then(assign);

          else
            return assign(result);
        }
      });

      return;
    }

    if (value instanceof Promise)
      return value.then(assign);

    else
      assign(value);
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
