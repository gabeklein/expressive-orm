import Query from '../Query';
import Field, { SELECT, TYPE, WHERE } from './Field';

declare namespace String {
  type Value = string & {
    [TYPE]?: VarCharColumn;
    [WHERE]?: Field.Where<string>;
    [SELECT]?: string;
  };

  type Nullable = Value | undefined | null;

  interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
    type?: "varchar" | "text" | "tinytext" | "mediumtext" | "longtext";
    length?: number;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

const LENGTH_DEFAULT = {
  "varchar": 2^8, // 256B
  "tinytext": 2^8, // 256B
  "text": 2^12, // 64KB
  "mediumtext": 2^24, // 16MB
  "longtext": 2^32 // 4GB
}

function String(): String.Value;
function String(column: string): String.Value;
function String(column: string, options: String.Optional): String.Nullable;
function String(column: string, options: String.Options): String.Value;
function String(options: String.Optional): String.Nullable;
function String(options: String.Options): String.Value;
function String(
  arg1: string | String.Options = {},
  arg2?: String.Options): any {

  if(typeof arg1 == "string")
    arg1 = { ...arg2, column: arg1 };

  let datatype = arg1.type || "varchar";

  if(!arg1.length)
    arg1.length = LENGTH_DEFAULT[datatype] - 1;

  if(datatype == "varchar")
    datatype += `(${arg1.length})`;

  return VarCharColumn.create({ datatype, ...arg1 });
}

class VarCharColumn extends Field {
  placeholder = `__${this.property}__`;

  where!: (query: Query<any>, parent?: string) => Field.Where<string>;
  select!: (query: Query<any>, path: string[], prefix?: string) => string;
}

export default String;