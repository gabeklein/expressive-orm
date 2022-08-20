import Query from '../Query';
import Table from '../Table';
import { qualify } from '../utility';

/**
 * Non-existant symbol lets us associate a
 * Field class with an entity-compatible type.
 */
export declare const TYPE: unique symbol;

/**
 * Non-existant symbol lets us associate a
 * Field class with an entity-compatible type.
 */
export declare const WHERE: unique symbol;

namespace Field {
  export type Type<T extends Field = Field> =
    typeof Field & (new (...args: any[]) => T);

  /** Using symbol, infer Field type for a given property. */
  export type Typeof<T> = { [TYPE]?: T };

  /** Using symbol, infer assertions for a given property. */
  export type Assertions<T> = { [WHERE]?: T };

  export type Callback<T extends Field> = (field: T, key: string) => void;

  export interface Where<T = any> {
    /** Select rows where this column is equal to value. */
    is(value: T): void;

    /** Select rows where this column is not equal to value. */
    isNot(value: T): void;

    /** Select rows where this colum is less-than value. */
    isLess(value: T): void;

    /** Select rows where this colum is greater-than value. */
    isMore(value: T): void;
  }
}

class Field {
  unique?: boolean;
  default?: any;
  nullable?: boolean;
  primary?: boolean;
  increment?: boolean;

  datatype: string | undefined;

  constructor(
    public table: Table,
    public property: string
  ){}

  get column(){
    return this.property;
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
    prefix?: string){

    let { column } = this;

    if(prefix)
      column = prefix + "." + column;

    return query.addSelect(column, (from, to) => {
      const key = path.pop()!;

      for(const key of path)
        to = to[key];

      to[key] = from[key];
    });
  };

  static create<T extends Field>(
    this: Field.Type<T>, options?: Partial<T>){

    return Table.apply((parent, key) => {
      const instance = new this(parent, key);
      instance.init(options);
      return instance;
    })
  }
}

export default Field;