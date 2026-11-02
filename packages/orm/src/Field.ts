export type Async<T> = T | Promise<T>;
export type MaybeLazy<T> = T | Promise<T> | (() => Async<T>);

export type Nullable<T extends Field = Field> = null | Partial<T> & { nullable: true }

export type Config<T = Field> = Partial<T> | null | undefined | false;

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
