import Query from './Query';
import Table from './Table';
import { qualify } from './utility';

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

  get?(value: any): any;
  set?(value: any): any;

  constructor(
    public table: Table,
    public property: string
  ){
    this.column = property;
  }

  compare(
    query: Query<any>,
    operator: string,
    key: string){

    return (value: any) => {
      if(this.set)
        value = this.set(value);

      query.compare(key, value, operator);
    }
  }

  init(options?: Partial<this>){
    this.table.fields.set(this.property, this);
    Object.assign(this, options);
  }

  where(query: Query<any>, parent?: string): any {
    const key = qualify(parent!, this.column);

    return {
      is: this.compare(query, "=", key),
      isNot: this.compare(query, "<>", key),
      isLess: this.compare(query, "<", key),
      isMore: this.compare(query, ">", key),
    }
  }

  select(
    query: Query<any>,
    path: string[],
    prefix?: string): any {

    let key = this.column;

    if(prefix)
      key = prefix + "." + key;

    query.addSelect(key, (data, into) => {
      const route = Array.from(path);
      const key = route.pop()!;

      for(const key of route)
        into = into[key];

      if(this.get)
        data = this.get(data);

      into[key] = data;
    });

    return this.placeholder;
  };

  static create<T extends Field>(
    this: Field.Type<T>, options?: Partial<T>){

    return Table.use((parent, key) => {
      const instance = new this(parent, key);
      instance.init(options);
      return instance;
    })
  }
}

export default Field;