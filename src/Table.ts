import Connection from './connection/Connection';
import Entity from './Entity';
import Field from './Field';

const describe = Object.getOwnPropertyDescriptor;

const REGISTER = new Map<Entity.Type, Table>();
const INSTRUCTION = new Map<symbol, Table.Instruction>();

namespace Table {
  export type Instruction = (parent: Table, key: string) => void;
}

class Table {
  fields = new Map<string, Field>();
  dependancies = new Set<Table>();
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

  map(
    getter: (this: {}, type: Field, key: string, thisArg: {}) => any,
    cache?: boolean){

    const proxy = {} as any;

    for(const [key, type] of this.fields)
      Object.defineProperty(proxy, key, {
        configurable: true,
        get: () => {
          const value = getter.call(proxy, type, key, proxy);

          if(cache !== false)
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

  static use(instruction: Table.Instruction){
    const placeholder = Symbol(`ORM instruction`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }
}

export default Table;