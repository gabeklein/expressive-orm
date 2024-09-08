import { Query, RelevantTable } from '../query/Query';
import { Type } from '../Type';
import { qualify } from '../utility';

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

  set?(value: any): any;

  get(value: any){
    return value;
  }

  constructor(
    public table: Type.EntityType,
    public property: string
  ){
    this.column = property;
  }

  toString(){
    const { alias, name } = RelevantTable.get(this)!;
    return qualify(alias || name, this.column);
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