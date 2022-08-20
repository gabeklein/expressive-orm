import Connection from './connection/Connection';
import Entity from './Entity';
import Field from './instruction/Field';

const describe = Object.getOwnPropertyDescriptor;

const INSTRUCTION = new Map<symbol, Table.Instruction>();

namespace Table {
  export type Instruction = (parent: Entity.Type, key: string) => Field | void;
}

class Table {
  fields = new Map<string, Field>();
  name: string;

  constructor(
    public entity: Entity.Type,
    public connection?: Connection){

    this.name = /class (\w+?) /.exec(entity.toString())![1];
    this.init();
  }

  map(getter: (type: Field, key: string) => any){
    const proxy = {} as any;

    for(const [key, type] of this.fields)
      Object.defineProperty(proxy, key, {
        get: () => getter(type, key)
      })
    
    return proxy;
  }

  private init(){
    const sample = new (this.entity as any)();
    
    for(const key in sample){
      const { value } = describe(sample, key)!;
      const instruction = INSTRUCTION.get(value);    

      if(!instruction)
        continue;

      delete (sample as any)[key];
      INSTRUCTION.delete(value);

      const field = instruction(this.entity, key);

      if(field)
        this.fields.set(key, field);
    }
  }

  static apply(instruction: Table.Instruction){
    const placeholder = Symbol(`ORM instruction`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }
}

export default Table;