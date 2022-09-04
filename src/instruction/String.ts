import Field, { SELECT, TYPE, WHERE } from '../Field';

namespace String {
  type Meta<T> = {
    [TYPE]?: VarCharColumn;
    [WHERE]?: Field.Where<T>;
    [SELECT]?: T;
  }

  export type Value = string & Meta<string>;
  export type Nullable = Value | undefined | null;

  export type OneOf<T> = T & Meta<T>;
  export type Maybe<T> = (T & Meta<T | null>) | undefined | null;

  export interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
    type?: "varchar" | "text" | "tinytext" | "mediumtext" | "longtext";
    length?: number;
  }

  export interface Specific<T extends string> extends Options {
    type?: "varchar";
    oneOf: T[];
  }

  export interface Optional extends Options {
    nullable: true;
  }
}

// in power of 2 bytes
const LENGTH_DEFAULT = {
  "varchar": 8,
  "tinytext": 8,
  "text": 12,
  "mediumtext": 24,
  "longtext": 32
}

function String(): String.Value;
function String(column: string): String.Value;
function String(column: string, options: String.Optional): String.Nullable;
function String(column: string, options: String.Options): String.Value;
function String(options: String.Optional): String.Nullable;
function String(options: String.Options): String.Value;
function String<T extends string>(options: String.Specific<T> & String.Optional): String.Maybe<T>;
function String<T extends string>(options: String.Specific<T>): String.OneOf<T>;
function String(
  arg1: string | String.Options = {},
  arg2?: String.Options): any {

  if(typeof arg1 == "string")
    arg1 = { ...arg2, column: arg1 };

  let datatype = arg1.type || "varchar";

  if(!arg1.length)
    arg1.length = 2 ** LENGTH_DEFAULT[datatype] - 1;

  if(datatype == "varchar")
    datatype += `(${arg1.length})`;

  return VarCharColumn.create({ datatype, ...arg1 });
}

class VarCharColumn extends Field {
  placeholder = `__${this.property}__`;
}

export default String;