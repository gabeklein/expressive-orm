import Entity from '../Entity';
import Query from '../Query';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace Ref {
  type Value<T extends Entity> = number & {
    [TYPE]?: ForeignKeyColumn<T>;
    [WHERE]?: Where<T>;
    [SELECT]?: number;
  };

  type Nullable<T extends Entity> = Value<T> | undefined | null;

  interface Options<T extends Entity> {
    type?: Entity.Type<T>;
    column?: string;
    nullable?: boolean;
  }

  interface Optional<T extends Entity> extends Options<T> {
    nullable?: true;
  }

  export interface Where<T> {
    is(value: T | number): void;
    isNot(value: T | number): void;
  }
}

function Ref<T extends Entity>(type: Entity.Type<T>): Ref.Value<T>;
function Ref<T extends Entity>(type: Entity.Type<T>, options: Ref.Optional<T>): Ref.Nullable<T>;
function Ref<T extends Entity>(type: Entity.Type<T>, options: Ref.Options<T>): Ref.Value<T>;
function Ref<T extends Entity>(options: Ref.Optional<T>): Ref.Nullable<T>;
function Ref<T extends Entity>(options: Ref.Options<T>): Ref.Value<T>;
function Ref<T extends Entity>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return ForeignKeyColumn.create(arg1);
}

class ForeignKeyColumn<T extends Entity = Entity> extends Field {
  // todo: depends on corresponding field.
  datatype = "INT";
  placeholder = 1;

  type!: Entity.Type;

  init(options: Partial<this>){
    this.table.dependancies.add(this.type.table);
    super.init(options);
  }

  where(query: Query<any>, key: string): Ref.Where<T> {
    function compare(operator: string){
      return (value: object | number) => {
        if(typeof value == "object")
          value = (value as any).id;

        query.addWhere(key, operator, value);
      }
    }

    return {
      is: compare("="),
      isNot: compare("<>"),
    }
  };
}

export default Ref;