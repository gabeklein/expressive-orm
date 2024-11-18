import { Type } from './Type';

export const FIELD = new Map<symbol, Field.Init>();

declare namespace Field {
  type Defined = {
    readonly [K in keyof Field]-?: Field[K];
  } & {
    parent: Type.EntityType;
    property: string;
  }

  type Init = (parent: Type.EntityType, key: string) => void;
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

function Field(options: Field | Field.Init): any {
  if(typeof options == "object"){
    const opts = options;

    options = (parent, property) => {
      const field = Object.create(Field.prototype);
  
      Object.assign(field, { column: property, property, parent }, opts);
      Object.freeze(field);
  
      parent.fields.set(property, field);
    }
  }

  const placeholder = Symbol(`field`);

  FIELD.set(placeholder, options);

  return placeholder;
}

Field.is = (value: unknown): value is Field.Defined => value instanceof Field;

Field.prototype = <Field.Defined> {
  column: "",
  index: 0,
  datatype: "varchar(255)",
  nullable: false,
  unique: false,
  primary: false,
  increment: false,
  default: null,
  set: (x: any) => x,
  get: (x: any) => x
}

export { Field }