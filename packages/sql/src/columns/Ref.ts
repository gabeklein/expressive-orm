import { Type, Field } from '..';

declare namespace Ref {
  interface OrNull<T extends Type> extends Ref<T> {
    nullable: true;
  }
}

interface Ref<T extends Type> extends Field {
  datatype: "INT";
  type: Type.EntityType<T>;
}

function Ref<T extends Type>(type: Type.EntityType<T>): number;
function Ref<T extends Type>(type: Type.EntityType<T>, options: Ref.OrNull<T>): number | null | undefined;
function Ref<T extends Type>(type: Type.EntityType<T>, options: Ref<T>): number;
function Ref<T extends Type>(options: Ref.OrNull<T>): number | null | undefined;
function Ref<T extends Type>(options: Ref<T>): number;
function Ref<T extends Type>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return Field({
    datatype: "INT",
    type: arg1.type,
    set(value: number | object){
      return typeof value == "object"
        ? (value as any).id
        : value;
    },
    ...arg1,
  });
}

export { Ref }