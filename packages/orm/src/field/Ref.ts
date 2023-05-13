import Entity, { Field } from '..';

declare namespace Ref {
  interface Options<T extends Entity> extends Field.Options {
    type?: Entity.Type<T>;
  }

  type Nullable<T extends Entity> = Options<T> & { nullable: true };
}

function Ref<T extends Entity>(type: Entity.Type<T>): number;
function Ref<T extends Entity>(type: Entity.Type<T>, options: Ref.Nullable<T>): number | null | undefined;
function Ref<T extends Entity>(type: Entity.Type<T>, options: Ref.Options<T>): number;
function Ref<T extends Entity>(options: Ref.Nullable<T>): number | null | undefined;
function Ref<T extends Entity>(options: Ref.Options<T>): number;
function Ref<T extends Entity>(arg1: any, arg2?: any): any {
  if(typeof arg1 == "function")
    arg1 = { ...arg2, type: arg1 };

  return ForeignKeyColumn.create(arg1);
}

class ForeignKeyColumn extends Field {
  // todo: depends on corresponding field.
  datatype = "INT";
  placeholder = 1;

  type!: Entity.Type;

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

export default Ref;