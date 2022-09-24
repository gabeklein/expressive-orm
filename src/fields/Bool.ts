import Field from '../Field';

declare namespace Bool {
  interface Options {
    column?: string;
    nullable?: boolean;
    either?: readonly [string, string];
  }

  interface Optional extends Options {
    nullable: true;
  }
}

function Bool(): boolean;
function Bool(options: Bool.Optional): boolean | null | undefined;
function Bool(options: Bool.Options): boolean;
function Bool(options: Bool.Options = {}){
  const opts: Partial<BooleanColumn> = options;
  const bool = options.either;

  if(bool)
    opts.datatype = `VARCHAR(${
      Math.max(bool[0].length, bool[1].length)
    })`

  return BooleanColumn.create(opts);
}

class BooleanColumn extends Field {
  datatype = "TINYINT";
  placeholder = true;
  either: readonly [any, any] = [1, 0];

  get(value: any){
    return value === this.either[0];
  }

  set(value: boolean){
    return value ? this.either[0] : this.either[1];
  }
}

export default Bool;