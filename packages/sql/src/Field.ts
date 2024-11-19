import { Table } from './Query';
import { Type } from './Type';

export const FIELD = new Map<symbol, Field.Init>();

declare namespace Field {
  type Ready = Readonly<Required<Field> & {
    parent: Type.EntityType;
    property: string;
    apply(table: Table): void;
  }>

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
  apply({ name, proxy, alias }){
    const field = Object.create(this);

    field.toString = () => `${alias || name}.${this.column}`;
    Object.defineProperty(proxy, this.property, { value: field });
  }
}

export { Field }