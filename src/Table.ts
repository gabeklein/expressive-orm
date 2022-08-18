import Connection from './Connection';
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