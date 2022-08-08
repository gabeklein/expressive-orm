import Entity from "../entity";
import Query from "../query/Query";

type SetupFunction = (parent: typeof Entity, key: string) => Field;
type Class = new (...args: any[]) => any;

const INSTRUCTION = new Map<symbol, SetupFunction>();

/**
 * Non-existant symbol lets us associate a
 * Field class with an entity-compatible type.
 */
export declare const TYPE: unique symbol;

namespace Field {
  /** Using our above symbol, we infer Field for a given entity-property. */
  export type Type<T> = { [TYPE]?: T };

  export type Callback<T extends Field> = (field: T, key: string) => void;

  export type Parameters<T extends new (...args: any) => any> =
    T extends new (parent: typeof Entity, property: string, ...args: infer P) => any ? P : never;

  export interface Options {
    name?: string;
    unique?: boolean;
    default?: any;
    nullable?: boolean;
  }

  export interface Where {
    /** Select rows where this column is equal to value. */
    is(value: any): void;

    /** Select rows where this column is not equal to value. */
    isNot(value: any): void;

    /** Select rows where this colum is less-than value. */
    isLess(value: any): void;

    /** Select rows where this colum is greater-than value. */
    isMore(value: any): void;
  }
}

abstract class Field {
  name: string;

  abstract assert(key: string, query: Query<any>): any;

  constructor(
    public parent: typeof Entity,
    public property: string,
    public options: Field.Options = {}
  ){
    this.name = options.name || property;
  }

  static create<T extends Class>(
    this: T, ...args: Field.Parameters<T>){

    const placeholder = Symbol(`column`);
  
    INSTRUCTION.set(placeholder, (parent, key) => {
      return new this(parent, key, ...args) as InstanceType<T>;
    });
  
    return placeholder as any;
  }

  static assign(
    entity: typeof Entity,
    key: string,
    placeholder: symbol){
  
    const instruction = INSTRUCTION.get(placeholder);
  
    if(!instruction)
      return;
  
    delete (entity as any)[key];
    INSTRUCTION.delete(placeholder);
  
    return instruction(entity, key);
  }
}

function basicAssertions<T extends Entity>(
  key: string, query: Query<T>): Field.Where {

  function addWhere(value: any, op: string){
    if(typeof value != 'number'){
      if(typeof value != 'string')
        value = String(value);
  
      value = `'${value.replace("'", "\'")}'`;
    }

    query.where.add([key, op, value]);
  }

  return {
    is: (value: any) => addWhere(value, "="),
    isNot: (value: any) => addWhere(value, "<>"),
    isLess: (value: any) => addWhere(value, "<"),
    isMore: (value: any) => addWhere(value, ">"),
  }
}

export default Field;
export { basicAssertions }