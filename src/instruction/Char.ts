import Field from '../Field';

declare namespace Char {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
    length?: number;
    variable?: boolean;
  }

  interface Specific<T extends string> extends Options {
    oneOf: T[];
  }

  interface Optional extends Options {
    nullable: true;
  }
}

function Char(length: number, options: Char.Optional): string | null | undefined;
function Char(length: number, options?: Char.Options): string;
function Char(options: Char.Optional): string | null | undefined;
function Char(options?: Char.Options): string;
function Char<T extends string>(options: Char.Specific<T> & Char.Optional): T | null | undefined;
function Char<T extends string>(options?: Char.Specific<T>): T;
function Char(
  arg1: number | Char.Options = {},
  arg2?: Char.Options): any {

  if(typeof arg1 == "number")
    arg1 = { ...arg2, length: arg1 };

  const datatype =
    `${arg1.variable ? "VAR" : ""}CHAR(${arg1.length || 255})`

  return CharColumn.create({ ...arg1, datatype });
}

function VarChar(length: number, options?: Char.Optional): string | null | undefined;
function VarChar(length: number, options?: Char.Options): string;
function VarChar(options: Char.Optional): string | null | undefined;
function VarChar(options?: Char.Options): string;
function VarChar<T extends string>(options: Char.Specific<T> & Char.Optional): T | null | undefined;
function VarChar<T extends string>(options: Char.Specific<T>): T;
function VarChar(
  arg1?: number | Char.Options,
  arg2?: Char.Options): any {

  if(typeof arg1 == "number")
    arg1 = { ...arg2, length: arg1 };

  return Char({ ...arg1, variable: true });
}

class CharColumn extends Field {
  variable = false;
  placeholder = `__${this.property}__`;
}

export default Char;
export { Char, VarChar }