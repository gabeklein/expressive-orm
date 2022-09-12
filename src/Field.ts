import Query, { Metadata } from './Query';
import Table from './Table';
import { qualify } from './utility';

export declare const TYPE: unique symbol;
export declare const VALUE: unique symbol;

namespace Field {
  export type Type<T extends Field = Field> =
    typeof Field & (new (...args: any[]) => T);

  /** Infer Field type for a given property. */
  export type Typeof<T> = { [TYPE]?: T };

  /** Infer assertions for a given property. */
  export type Value<T> = { [VALUE]?: T };

  export type Callback<T extends Field> = (field: T, key: string) => void;
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
    query: Query,
    operator: string){

    return (value: any) => {
      query.where(this, value, operator);
    }
  }

  init(options?: Partial<this>){
    this.table.fields.set(this.property, this);
    Object.assign(this, options);
  }

  proxy(query: Query){
    const { access, selects } = query;
    const { alias, name } = Metadata.get(this)!;
    const ref = qualify(alias || name, this.column);

    let column!: number;

    return () => {
      switch(query.mode){
        case "select": {
          column = access.size + 1;
          selects.add(`${ref} AS ${qualify("S" + column)}`);
          access.set(this, ref);
          return this.placeholder;
        }

        case "query":
          return this;

        case "fetch":
          return query.rawFocus["S" + column];
      }
    }
  }

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