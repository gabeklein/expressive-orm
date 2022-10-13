import Entity from '.';
import Query, { RelevantTable } from './query/Query';
import { qualify } from './utility';

declare namespace Field {
  interface Options {
    column?: string;
    default?: any;
    nullable?: boolean;
    unique?: boolean;
  }

  type Type<T extends Field = Field> =
    typeof Field & (new (...args: any[]) => T);

  type Callback<T extends Field> = (field: T, key: string) => void;
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
    public table: Entity.Type,
    public property: string
  ){
    this.column = property;
  }

  get qualifiedName(){
    const { alias, name } = RelevantTable.get(this)!;
    return qualify(alias || name, this.column);
  }

  compare(query: Query, op: string){
    return (value: any) => {
      query.assert(op, this, value);
    }
  }

  init(options?: Partial<this>){
    this.table.fields.set(this.property, this);
    Object.assign(this, options);
  }

  proxy(query: Query<any>, _proxy: {}){
    return () => query.access(this);
  }

  static create<T extends Field>(
    this: Field.Type<T>, options?: Partial<T>){

    return Entity.field((parent, key) => {
      const instance = new this(parent, key);
      instance.init(options);
      return instance;
    })
  }
}

export default Field;