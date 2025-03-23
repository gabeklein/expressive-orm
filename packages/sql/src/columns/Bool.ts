import { Field } from '../type/Field';

class BooleanColumn extends Field<boolean> {
  readonly type: "tinyint" | "varchar" = "tinyint";

  readonly either?: [true: string, false: string];

  protected readonly TRUE: string | number | boolean = 1;
  protected readonly FALSE: string | number | boolean = 0;

  constructor(opts: Bool.Opts = {}) {
    super(opts);

    if(opts.either)
      [this.TRUE, this.FALSE] = opts.either;
  }

  get datatype() {
    if(this.either){
      const [TRUE, FALSE] = this.either;
      return `varchar(${Math.max(TRUE.length, FALSE.length)})`;
    }

    return this.type;
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