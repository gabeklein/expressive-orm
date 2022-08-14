import Entity from '../Entity';
import Field, { TYPE } from './Field';

declare namespace Many {
  export type Entites<T extends Entity> = T[] & TypeDef;

  interface TypeDef {
    [TYPE]?: ManyToOneRelation;
  }

  interface Options {

  }
}

function Many<T extends Entity>(type: Entity.Type<T>): Many.Entites<T>;
function Many(type: Entity.Type, options?: Many.Options){
  return ManyToOneRelation.create({ type, ...options });
}

class ManyToOneRelation extends Field {
  type!: Entity.Type;
}

export default Many;