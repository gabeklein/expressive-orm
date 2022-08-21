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
function VarChar(column: string): VarChar.Value;
function VarChar(column: string, options: VarChar.Optional): VarChar.Nullable;
function VarChar(column: string, options: VarChar.Options): VarChar.Value;
function VarChar(options: VarChar.Optional): VarChar.Nullable;
function VarChar(options: VarChar.Options): VarChar.Value;
function VarChar(arg1?: any, arg2?: any): any {
  if(typeof arg1 == "string")
    arg1 = { column: arg1 };

  return VarCharColumn.create({ ...arg2, ...arg1 });
}

class VarCharColumn extends Field {
  length = 255;

  init(options: Partial<this>){
    this.datatype = `VARCHAR(${this.length})`;
    super.init(options);
  }
}

export default VarChar;