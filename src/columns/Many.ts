import Entity from '../entity';
import Field, { TYPE } from "./Field";
  type InstanceOf<T> =
    T extends { prototype: infer U } ? U : never;

declare namespace Many {
  export type Entites<T extends Entity> = T[] & TypeDef;

  interface TypeDef {
    [TYPE]?: ManyToOneRelation;
  }
}

function Many<T extends typeof Entity>(type: T): Many.Entites<InstanceOf<T>>;
function Many(type: typeof Entity){
  return ManyToOneRelation.create({ type });
}

class ManyToOneRelation extends Field {
  type!: typeof Entity;

  assert(){};
}

export default Many;