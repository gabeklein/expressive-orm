import { Query, RelevantTable } from './Query';
import { Type } from './Type';

declare namespace Field {
  type FieldType<T extends Field = Field> = typeof Field & (new (...args: any[]) => T);

  type Callback<T extends Field> = (field: T, key: string) => void;

  interface Options<T = any> {
    datatype?: string;
    column?: string;
    default?: any;
    nullable?: boolean;
    placeholder?: T;
    unique?: boolean;

    get?(value: any): T;
    set?(value: T): any;
  }

  interface Instruction {
    (skip?: true): void;
    (modify: (where: string) => string): void;
  }

  interface Assert<T> {
    is(equalTo: T): void;
    isNot(equalTo: T): void;
    isMore(than: T): void;
    isLess(than: T): void;
  }
}

class Field {
  column!: string;
  datatype?: string;
  constraint?: string;
  unique?: boolean;
  default?: any;
  nullable?: boolean;
  primary?: boolean;
  increment?: boolean;
  placeholder: any;

  // TODO: Implement these
  // foreign?: string;
  // index?: string;
  // references?: string;
  // onDelete?: string;
  // onUpdate?: string;
  // onInsert?: string;

  /** Converts acceptable values to their respective database values. */
  set?(value: unknown): any;

  /** Converts database values to type of value in javascript. */
  get?(value: unknown): any;

  constructor(
    public table: Type.EntityType,
    public property: string
  ){
    this.column = property;
  }

  assert<T>(apply: (cond: Query.Cond<T>) => void): Field.Assert<T> {
    return {
      is: val => apply({ left: this, right: val, operator: "=" }),
      isNot: val => apply({ left: this, right: val, operator: "<>" }),
      isMore: val => apply({ left: this, right: val, operator: ">" }),
      isLess: val => apply({ left: this, right: val, operator: "<" }),
    }
  }

  toString(){
    const { alias, name } = RelevantTable.get(this)!;
    return `${alias || name}.${this.column}`;
  }

  init(options?: Partial<this>){
    Object.assign(this, options);
  }

  proxy(query: Query<any>, _proxy: {}){
    return () => query.access(this);
  }

  static create<T extends Field>(
    this: Field.FieldType<T>, options?: Partial<T>){

    return Type.add((parent, key) => {
      const instance = new this(parent, key);

      parent.fields.set(key, instance);
      instance.init(options);

      if(key == "id"){
        instance.primary = true;

        if(instance.datatype!.includes("INT"))
          instance.increment = true;
      }

      return instance;
    })
  }
}

export { Field }