import { RelevantTable } from './Query';
import { Type } from './Type';

export const FIELD = new Map<symbol, Field.Init>();

declare namespace Field {
  type Defined = {
    readonly [K in keyof Field]-?: Field[K];
  }

  type Init = (parent: Type.EntityType, key: string) => void;

  const defaults: Partial<Field>;

  function is(value: unknown): value is Defined;
}

interface Field {
  column?: string;
  datatype?: string;
  unique?: boolean;
  nullable?: boolean;
  primary?: boolean;
  increment?: boolean;
  default?: string | null;

  index?: number;

  /** Converts acceptable values to their respective database values. */
  set?(value: unknown): any;

  /** Converts database values to type of value in javascript. */
  get?(value: unknown): any;
}

function Field(options: Partial<Field> | Field.Init){
  const placeholder = Symbol(`field`);

  if(typeof options == "object"){
    const inputs = options;

    options = (parent, key) => {
      const field = Object.create(Field.prototype);
  
      Object.assign(field, Field.defaults, inputs, {
        column: inputs.column || key,
        toString(this: Field){
          const table = RelevantTable.get(this);
          const prefix = table ? `${table.alias || table.name}.` : "";
  
          return prefix + this.column;
        }
      });
  
      Object.freeze(field);
      parent.fields.set(key, field);
  
      return field;
    }
  }

  FIELD.set(placeholder, options);
  
  return placeholder as any;
}

Object.defineProperty(Field, "is", {
  writable: false,
  value(value: unknown){
    return value instanceof Field;
  },
})

Object.defineProperty(Field, "defaults", {
  writable: false,
  value: <Field.Defined>{
    column: "",
    index: 0,
    datatype: "varchar(255)",
    nullable: false,
    unique: false,
    primary: false,
    increment: false,
    default: null,
    set: x => x,
    get: x => x,
  }
})

export { Field }