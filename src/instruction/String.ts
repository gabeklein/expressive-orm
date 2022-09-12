import Field from '../Field';

namespace String {
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

function String(): string;
function String(column: string): string;
function String(column: string, options: String.Optional): string | null | undefined;
function String(column: string, options: String.Options): string;
function String(options: String.Optional): string | null | undefined;
function String(options: String.Options): string;
function String<T extends string>(options: String.Specific<T> & String.Optional): T | null | undefined;
function String<T extends string>(options: String.Specific<T>): T;
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