import Field from '../Field';

namespace VarChar {
  export interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
    length?: number;
  }

  export interface Specific<T extends string> extends Options {
    oneOf: T[];
  }

  export interface Optional extends Options {
    nullable: true;
  }
}

function VarChar(column?: string): string;
function VarChar(column: string, options: VarChar.Optional): string | null | undefined;
function VarChar(column: string, options: VarChar.Options): string;
function VarChar(options: VarChar.Optional): string | null | undefined;
function VarChar(options: VarChar.Options): string;
function VarChar<T extends string>(options: VarChar.Specific<T> & VarChar.Optional): T | null | undefined;
function VarChar<T extends string>(options: VarChar.Specific<T>): T;
function VarChar(
  arg1: string | VarChar.Options = {},
  arg2?: VarChar.Options): any {

  if(typeof arg1 == "string")
    arg1 = { ...arg2, column: arg1 };

  return VarCharColumn.create({
    datatype: `varchar(${arg1.length || 255})`,
    ...arg1
  });
}

class VarCharColumn extends Field {
  placeholder = `__${this.property}__`;
}

export default VarChar;