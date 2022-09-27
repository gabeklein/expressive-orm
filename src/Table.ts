import Connection from './connection/Connection';
import Entity from './Entity';
import Field from './Field';

const describe = Object.getOwnPropertyDescriptor;
const define = Object.defineProperty;

const REGISTER = new Map<Entity.Type, Table>();
const INSTRUCTION = new Map<symbol, Table.Instruction>();

declare namespace Table {
  type Instruction = (parent: Table, key: string) => void;
  type MapFunction<T extends Entity> = (this: T, type: Field, key: Entity.Field<T>, thisArg: T) => any;
}

class Table {
  fields = new Map<string, Field>();
  dependancies = new Set<Table>();
  name: string;
  schema: string;
  focus?: { [key: string]: any };

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
      define(sample, key, {
        get: () => this.focus![key],
        set: is => this.focus![key] = is
      })
    }
  }

  map<T extends Entity>(
    getter: Table.MapFunction<T>,
    cache?: boolean){

    const proxy = {} as any;

    for(const [key, type] of this.fields)
      define(proxy, key, {
        configurable: true,
        get: () => {
          const value = getter.call(
            proxy,
            type,
            key as Entity.Field<T>,
            proxy
          );

          if(cache !== false)
            define(proxy, key, { value });

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