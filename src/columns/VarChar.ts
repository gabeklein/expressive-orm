import Field, { basicAssertions, TYPE } from './Field';

declare namespace VarChar {
  type Value = string & TypeDef;
  type Optional = Value | undefined | null;

  interface TypeDef {
    [TYPE]?: VarCharColumn;
  }

  interface Options {
    name?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
  }

  interface Nullable extends Options {
    nullable: true;
  }
}

function VarChar(): VarChar.Value;
function VarChar(options: VarChar.Nullable): VarChar.Optional;
function VarChar(options: VarChar.Options): VarChar.Value;
function VarChar(options: VarChar.Options = {}){
  return VarCharColumn.create(options);
}

class VarCharColumn extends Field {
  assert = basicAssertions;
}

export default VarChar;