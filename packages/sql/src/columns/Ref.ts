import { Type, Field } from '..';

declare namespace Ref {
  interface Options<T extends Type> extends Field.Options {
    type?: Type.EntityType<T>;
  }

  type Nullable<T extends Type> = Options<T> & { nullable: true };
}

function Ref<T extends Type>(type: Type.EntityType<T>): number;
function Ref<T extends Type>(type: Type.EntityType<T>, options: Ref.Nullable<T>): number | null | undefined;
function Ref<T extends Type>(type: Type.EntityType<T>, options: Ref.Options<T>): number;
function Ref<T extends Type>(options: Ref.Nullable<T>): number | null | undefined;
function Ref<T extends Type>(options: Ref.Options<T>): number;
function Ref<T extends Type>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return ForeignKeyColumn.create(arg1);
}

class ForeignKeyColumn extends Field {
  // todo: depends on corresponding field.
  datatype = "INT";
  placeholder = 1;

  type!: Type.EntityType;

  init(options: Partial<this>){
    this.table.deps.add(this.type);
    super.init(options);
  }

  set(value: number | object){
    return typeof value == "object"
      ? (value as any).id
      : value;
  }
}

export { Ref }