import Connection from './connection/Connection';
import Entity from './Entity';
import Field from './Field';

const describe = Object.getOwnPropertyDescriptor;

const REGISTER = new Map<Entity.Type, Definition>();
const INSTRUCTION = new Map<symbol, Definition.Instruction>();

namespace Definition {
  export type Instruction = (parent: Definition, key: string) => void;
}

class Definition {
  fields = new Map<string, Field>();
  dependancies = new Set<Definition>();
  name: string;
  schema: string;

  constructor(
    public entity: Entity.Type,
    public connection?: Connection){

    REGISTER.set(entity, this);

    this.name = /class (\w+?) /.exec(entity.toString())![1];
    this.schema = "";
    
    const sample = new (this.entity as any)();
    
    for(const key in sample){
      const desc = describe(sample, key)!;
      this.apply(desc.value, key);
    }
  }

  map(getter: (type: Field, key: string) => any){
    const proxy = {} as any;

    for(const [key, type] of this.fields)
      Object.defineProperty(proxy, key, {
        configurable: true,
        get: () => {
          const value = getter(type, key);
          Object.defineProperty(proxy, key, { value });
          return value;
        }
      })
    
    return proxy;
  }

  apply(value: any, key: string){
    const instruction = INSTRUCTION.get(value);    

    if(instruction){
      INSTRUCTION.delete(value);
      instruction(this, key);
    }
  }

  static get(type: Entity.Type){
    return REGISTER.get(type) || type.init();
  }

  static use(instruction: Definition.Instruction){
    const placeholder = Symbol(`ORM instruction`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }
}

export default Definition;