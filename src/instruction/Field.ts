import Query from '../Query';
import Definition from '../Definition';
import { qualify } from '../utility';

export declare const TYPE: unique symbol;
export declare const WHERE: unique symbol;
export declare const SELECT: unique symbol;

namespace Field {
  export type Type<T extends Field = Field> =
    typeof Field & (new (...args: any[]) => T);

  /** Infer Field type for a given property. */
  export type Typeof<T> = { [TYPE]?: T };

  /** Infer assertions for a given property. */
  export type Assertions<T> = { [WHERE]?: T };

  /** Infer assertions for a given property. */
  export type Selects<T> = { [SELECT]?: T };

  export type Callback<T extends Field> = (field: T, key: string) => void;

  export interface Where<T = any> {
    is(value: T): void;
    isNot(value: T): void;
    isLess(value: T): void;
    isMore(value: T): void;
  }
}

class Field {
  unique?: boolean;
  default?: any;
  nullable?: boolean;
  primary?: boolean;
  increment?: boolean;
  column: string;
  constraint?: string;
  placeholder: any;

  datatype: string | undefined;

  constructor(
    public table: Definition,
    public property: string
  ){
    this.column = property;
  }

  init(options?: Partial<this>){
    this.table.fields.set(this.property, this);
    Object.assign(this, options);
  }

  where(query: Query<any>, parent?: string): any {
    const key = qualify(parent!, this.column);
    const compare = (operator: string) =>
      (value: any) => query.compare(key, value, operator);
  
    return {
      is: compare("="),
      isNot: compare("<>"),
      isLess: compare("<"),
      isMore: compare(">"),
    }
  }

  select(
    query: Query<any>,
    path: string[],
    prefix?: string): any {

    let { column } = this;

    if(prefix)
      column = qualify(prefix, column);

    query.addSelect(column, (from, to) => {
      const route = Array.from(path);
      const key = route.pop()!;

      for(const key of route)
        to = to[key];

      to[key] = from[column];
    });

    return this.placeholder;
  };

  static create<T extends Field>(
    this: Field.Type<T>, options?: Partial<T>){

    return Definition.use((parent, key) => {
      const instance = new this(parent, key);
      instance.init(options);
      return instance;
    })
  }
}

export default Field;