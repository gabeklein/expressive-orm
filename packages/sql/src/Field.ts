import { RelevantTable } from './Query';
import { Type } from './Type';

declare namespace Field {
  type Defined = {
    readonly [K in keyof Field]-?: Field[K];
  }

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

function Field(options: Partial<Field>): any {
  return Type.add((parent, key) => {
    const field = Object.create(Field.prototype);

    Object.assign(field, Field.defaults, options, {
      column: options.column || key,
      toString(this: Field){
        const table = RelevantTable.get(this);
        const prefix = table ? `${table.alias || table.name}.` : "";

        return prefix + this.column;
      }
    });

    Object.freeze(field);

    parent.fields.set(key, field);

    return field;
  })
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
    datatype: "VARCHAR(255)",
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