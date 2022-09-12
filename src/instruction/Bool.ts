import Field from '../Field';

declare namespace Bool {
  interface Options {
    column?: string;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Bool(): boolean;
function Bool(options: Bool.Optional): boolean | null | undefined;
function Bool(options: Bool.Options): boolean;
function Bool(options: Bool.Options = {}){
  return BooleanColumn.create(options);
}

class BooleanColumn extends Field {
  datatype = "TINYINT";
  placeholder = true;

  get(value: 0 | 1){
    return !!value;
  }

  set(value: boolean){
    return value ? 1 : 0;
  }
}

export default Bool;