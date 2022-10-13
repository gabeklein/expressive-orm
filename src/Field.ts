import Entity from '.';
import Query, { RelevantTable } from './query/Query';
import { escapeString, qualify } from './utility';

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

  interface Instruction {
    (skip?: true): void;
    (modify: (where: string) => string): void;
  }

  interface Assertions<T> {
    is(equalTo: T | undefined): Instruction;
    not(equalTo: T | undefined): Instruction;
    greater(than: T | undefined): Instruction;
    less(than: T | undefined): Instruction;
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
    public table: Entity.Type,
    public property: string
  ){
    this.column = property;
  }

  where(query: Query<any>): Field.Assertions<any> {
    return {
      is: this.assert(query, "="),
      not: this.assert(query, "<>"),
      greater: this.assert(query, ">"),
      less: this.assert(query, "<"),
    }
  }

  get qualifiedName(){
    const { alias, name } = RelevantTable.get(this)!;
    return qualify(alias || name, this.column);
  }

  assert(query: Query, op: string){
    return (value: any) => {
      if(!(value instanceof Field)){
        if(this.set)
          value = this.set(value);

        if(typeof value == "string")
          value = escapeString(value);
      }

      return query.assert(op, this, value);
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