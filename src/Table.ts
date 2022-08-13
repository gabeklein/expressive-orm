import Entity from "./Entity";
import Field from "./instruction/Field";

const describe = Object.getOwnPropertyDescriptor;

const INSTRUCTION = new Map<symbol, Table.Instruction>();

namespace Table {
  export type Instruction = (parent: typeof Entity, key: string) => Field | void;

  export interface Connection {}
}

class Table {
  entity: typeof Entity;
  fields: Map<string, Field>;
  connection?: Table.Connection;
  name: string;

  constructor(
    entity: typeof Entity,
    connection?: Table.Connection){

    const fields = this.fields = new Map();

    this.entity = entity;
    this.name = /class (\w+?) /.exec(entity.toString())![1];
    this.connection = connection;

    const sample = new (entity as any)();
    
    for(const key in sample){
      const { value } = describe(sample, key)!;
      const instruction = INSTRUCTION.get(value);    

      if(!instruction)
        continue;

      delete (sample as any)[key];
      INSTRUCTION.delete(value);

      const field = instruction(sample, key);

      if(field)
        fields.set(key, field);
    }
  }

  static apply(instruction: Table.Instruction){
    const placeholder = Symbol(`ORM instruction`);
    INSTRUCTION.set(placeholder, instruction);
    return placeholder as any;
  }
}

export default Table;