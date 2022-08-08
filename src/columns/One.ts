import Entity from '../entity';
import Field, { TYPE } from "./Field";

type InstanceOf<T> =
  T extends { prototype: infer U } ? U : never;

namespace One {
  export type Field<T extends Entity> = T & TypeDef;

  interface TypeDef {
    [TYPE]?: OneToManyRelation;
  }
}

type One<T extends Entity> = One.Field<T>;

function One<T extends typeof Entity>(type: T): One<InstanceOf<T>>;
function One(type: typeof Entity): any {
  return OneToManyRelation.create();
}

class OneToManyRelation extends Field {
  assert(){};
}

export default One;