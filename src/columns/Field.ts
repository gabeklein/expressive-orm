import Entity from "../entity";
import Query from "../query/Query";

type SetupFunction = (parent: typeof Entity, key: string) => Field;

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
    public property: string,
    public parent: typeof Entity
  ){
    this.name = property;
  }

  static create<T extends typeof Field>(
    this: T,
    callback?: Field.Callback<InstanceType<T>>){

    const placeholder = Symbol(`column`);
  
    INSTRUCTION.set(placeholder, (parent, key) => {
      const field = new (this as any)(key, parent) as InstanceType<T>;

      if(callback)
        callback(field, key);

      return field;
    });
  
    return placeholder as unknown as T;
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
    if(typeof value != 'string')
      value = String(value);

    value = `'${value.replace("'", "\'")}'`;

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