import Query, { Metadata } from './query/Query';
import Select from './query/Select';
import Table from './Table';
import { qualify } from './utility';

namespace Field {
  export type Type<T extends Field = Field> =
    typeof Field & (new (...args: any[]) => T);

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
      query.where(operator, this, value);
    }
  }

  init(options?: Partial<this>){
    this.table.fields.set(this.property, this);
    Object.assign(this, options);
  }

  get qualifiedName(){
    const { alias, name } = Metadata.get(this)!;
    return qualify(alias || name, this.column);
  }

  proxy(query: Query | Select<any>, proxy: {}){
    let column!: number;

    return () => {
      if(query instanceof Select)
        switch(query.state){
          case "select": {
            column = query.select(this);
            return this.placeholder;
          }

          case "fetch": {
            const value = query.rawFocus[column];
            return value === null ? undefined : value;
          }
        }

      return this;
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