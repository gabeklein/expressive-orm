import Field from '../Field';

declare namespace Binary {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
    length?: number;
    variable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Binary(a1: Binary.Optional): never | null | undefined;
function Binary(a1?: Binary.Options): never;
function Binary(a1: Binary.Options = {}){
  const datatype =
    `${a1.variable ? "VAR" : ""}BINARY(${a1.length || 1})`

  return BinaryColumn.create({ ...a1, datatype });
}

function VarBinary(options: Binary.Optional): never | null | undefined;
function VarBinary(options?: Binary.Options): never;
function VarBinary(options?: Binary.Options){
  return BinaryColumn.create({ ...options, variable: true });
}

class BinaryColumn extends Field {
  variable = false;
}

export default Binary;
export { Binary, VarBinary }