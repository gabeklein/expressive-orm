import { Table } from './Query';
import { Type } from './Type';
import { underscore } from './utils';

export const FIELD = new Map<symbol, Field.Init>();

declare namespace Field {
  type Ready = Readonly<Required<Field> & {
    parent: Type.EntityType;
    property: string;
  }>

  type Init = (key: string, parent: Type.EntityType) => Field | void;
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

  references?: {
    table: string;
    column: string;
  };

  /** Converts acceptable values to their respective database values. */
  set?(this: Field.Ready, value: unknown): any;

  /** Converts database values to type of value in javascript. */
  get?(this: Field.Ready, value: unknown): any;

  query?(this: Field.Ready, table: Table, property: string): void;
}

function Field(options: Field | Field.Init): any {
  const placeholder = Symbol(`field`);

  FIELD.set(placeholder, (property, parent) => {
    const field = Object.create(Field.prototype);

    if (typeof options === "function")
      options = options(property, parent) || {};

    field.column = underscore(property);
    field.property = property;
    field.parent = parent;

    Object.entries(options).forEach(([key, value]) => {
      if(value !== undefined)
        field[key] = value;
    })

    Object.freeze(field);
    parent.fields.set(property, field);
  });

  return placeholder;
}

Field.is = (value: unknown): value is Field.Ready => value instanceof Field;

Field.prototype = <Field.Ready> {
  column: "",
  index: 0,
  datatype: "varchar(255)",
  nullable: false,
  unique: false,
  primary: false,
  increment: false,
  default: null,
  set: (x: any) => x,
  get: (x: any) => x,
  query({ name, proxy, alias }, property: string){
    const field = Object.create(this);

    field.toString = () => `${alias || name}.${this.column}`;
    Object.defineProperty(proxy, property, { value: field });
  }
}

export { Field }