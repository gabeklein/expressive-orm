import Field from '../Field';

declare namespace Boolean {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Boolean(options: Boolean.Optional): never | null | undefined;
function Boolean(options?: Boolean.Options): never;
function Boolean(options?: Boolean.Options){
  return BooleanColumn.create({ ...options });
}

class BooleanColumn extends Field {
  datatype = "BOOLEAN";
}

export default Boolean;