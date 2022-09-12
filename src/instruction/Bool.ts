import Field, { TYPE, VALUE } from '../Field';

declare namespace Bool {
  type Value = boolean & {
    [TYPE]?: BooleanColumn;
    [VALUE]?: boolean;
  };

  type Nullable = Value | undefined | null;

  interface Options {
    column?: string;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Bool(): Bool.Value;
function Bool(options: Bool.Optional): Bool.Nullable;
function Bool(options: Bool.Options): Bool.Value;
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