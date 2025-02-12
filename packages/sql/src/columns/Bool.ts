import { Field } from '../type/Field';

class BooleanColumn extends Field<boolean> {
  readonly type: "tinyint" | "varchar" = "tinyint";
  readonly datatype: string;

  readonly TRUE: string | number = 1;
  readonly FALSE: string | number = 0;

  constructor(opts: Bool.Opts = {}) {
    let type: "tinyint" | "varchar" = "tinyint";
    let datatype = "tinyint";
    let TRUE: string | number = 1;
    let FALSE: string | number = 0;

    if ("either" in opts && opts.either) {
      [TRUE, FALSE] = opts.either;
      type = "varchar";
      datatype = `varchar(${Math.max(TRUE.length, FALSE.length)})`;
    }

    super(opts);

    this.type = type;
    this.datatype = datatype;
    this.TRUE = TRUE;
    this.FALSE = FALSE;
  }

  get(value: unknown) {
    return value === this.TRUE;
  }

  set(value: boolean) {
    if (typeof value !== "boolean")
      throw "Value must be a boolean.";

    return value ? this.TRUE : this.FALSE;
  }
}

declare namespace Bool {
  interface TinyInt extends BooleanColumn {
    readonly type: "tinyint"; 
  }

  interface Char extends BooleanColumn {
    readonly type: "varchar";
    either?: [true: string, false: string];
  }

  type Any = TinyInt | Char;
  type Opts = Partial<Any>;
}

interface Bool extends BooleanColumn {}

function Bool<T extends Bool.Opts>(opts?: T){
  return new BooleanColumn(opts) as Field.Specify<T, Bool.Any>;
}

Bool.Type = BooleanColumn;

export { Bool };