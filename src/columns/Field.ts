import Entity from '../Entity';
import Query from '../Query';

type SetupFunction = (parent: typeof Entity, key: string) => Field;
type Class = new (...args: any[]) => any;

const INSTRUCTION = new Map<symbol, SetupFunction>();

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
  /** Using symbol, infer Field type for a given property. */
  export type Type<T> = { [TYPE]?: T };

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

abstract class Field {
  name: string;
  unique?: boolean;
  default?: any;
  nullable?: boolean;

  constructor(
    public parent: typeof Entity,
    public property: string
  ){
    this.name = property;
  }

  where(query: Query<any>, key: string): any {
    function compare(operator: string){
      return (value: any) => {
        query.where(key, operator, value);
      }
    }
  
    return {
      is: compare("="),
      isNot: compare("<>"),
      isLess: compare("<"),
      isMore: compare(">"),
    }
  }

  static create<T extends Class>(
    this: T, options?: Partial<InstanceType<T>>){

    const placeholder = Symbol(`column`);
  
    INSTRUCTION.set(placeholder, (parent, key): InstanceType<T> => {
      return Object.assign(new this(parent, key), options);
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

export default Field;