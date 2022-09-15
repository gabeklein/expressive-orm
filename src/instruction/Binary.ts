import Field from '../Field';

declare namespace Binary {
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

function Binary(options: Binary.Optional): never | null | undefined;
function Binary(options?: Binary.Options): never;
function Binary(options?: Binary.Options){
  return BinaryColumn.create({ ...options });
}

class BinaryColumn extends Field {
  datatype = "BOOLEAN";
}

export default Binary;