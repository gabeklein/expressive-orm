import Field, { TYPE, WHERE } from './Field';

declare namespace String {
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

function String(): String.Value;
function String(column: string): String.Value;
function String(column: string, options: String.Optional): String.Nullable;
function String(column: string, options: String.Options): String.Value;
function String(options: String.Optional): String.Nullable;
function String(options: String.Options): String.Value;
function String(arg1?: any, arg2?: any): any {
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

export default String;