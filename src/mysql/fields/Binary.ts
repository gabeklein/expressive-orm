import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Binary {
  interface Options extends Field.Options {
    length?: number;
    variable?: boolean;
  }

  interface Optional extends Options {
    nullable: true;
  }
}

function Binary(a1: Binary.Optional): never | null | undefined;
function Binary(a1?: Binary.Options): never;
function Binary(a1: Binary.Options = {}){
  const datatype =
    `${a1.variable ? "VAR" : ""}BINARY(${a1.length || 1})`

  return Column({ ...a1, datatype });
}

function VarBinary(options: Binary.Optional): never | null | undefined;
function VarBinary(options?: Binary.Options): never;
function VarBinary(options?: Binary.Options){
  return Column(options);
}

export default Binary;
export { Binary, VarBinary }