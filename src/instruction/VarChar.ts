import Field, { TYPE, WHERE } from './Field';

declare namespace VarChar {
  type Value = string & MetaData;
  type Nullable = Value | undefined | null;

  interface MetaData {
    [TYPE]?: VarCharColumn;
    [WHERE]?: Field.Where<string>;
  }

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

function VarChar(): VarChar.Value;
function VarChar(options: VarChar.Optional): VarChar.Nullable;
function VarChar(options: VarChar.Options): VarChar.Value;
function VarChar(options: VarChar.Options = {}){
  return VarCharColumn.create(options);
}

class VarCharColumn extends Field {
  length = 255;

  get datatype(){
    return `VARCHAR(${this.length})`;
  }
}

export default VarChar;