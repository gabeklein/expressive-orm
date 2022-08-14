import Entity from '../Entity';
import Query from '../Query';
import Field, { TYPE, WHERE } from './Field';

declare namespace Ref {
  type Value<T extends Entity> = number & {
    [TYPE]?: ForeignKeyColumn;
    [WHERE]?: Where<T>;
  };

  type Optional<T extends Entity> = Value<T> | undefined | null;

  interface Options<T extends Entity> {
    type?: Entity.Type<T>;
    column?: string;
    nullable?: boolean;
  }

  interface Nullable<T> extends Options<T> {
    nullable: true;
  }

  export interface Where<T> {
    is(value: T | number): void;
    isNot(value: T | number): void;
  }
}

function Ref<T>(type: Entity.Type<T>): Ref.Value<T>;
function Ref<T>(type: Entity.Type<T>, options: Ref.Nullable<T>): Ref.Optional<T>;
function Ref<T>(type: Entity.Type<T>, options: Ref.Options<T>): Ref.Value<T>;
function Ref<T>(options: Ref.Nullable<T>): Ref.Optional<T>;
function Ref<T>(options: Ref.Options<T>): Ref.Value<T>;
function Ref<T>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { type: arg1 };

  return ForeignKeyColumn.create({ ...arg2, ...arg1 });
}

class ForeignKeyColumn extends Field {
  where(query: Query<any>, key: string){
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