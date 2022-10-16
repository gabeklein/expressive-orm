import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Char {
  interface Options extends Field.Options {
    length?: number;
    oneOf?: any[];
    variable?: boolean;
  }

  interface Specific<T extends string> extends Options {
    oneOf: T[];
  }

  type Nullable = Options & { nullable: true };
}

function Char<T extends string>(options: Char.Specific<T> & Char.Nullable): T | null | undefined;
function Char<T extends string>(options?: Char.Specific<T>): T;
function Char(length: number, options: Char.Nullable): string | null | undefined;
function Char(length: number, options?: Char.Options): string;
function Char(options: Char.Nullable): string | null | undefined;
function Char(options?: Char.Options): string;
function Char(
  arg1: number | Char.Options = {},
  arg2?: Char.Options): any {

  if(typeof arg1 == "number")
    arg1 = { ...arg2, length: arg1 };

  const datatype =
    `${arg1.variable ? "VAR" : ""}CHAR(${arg1.length || 255})`

  return Column({
    ...arg1,
    datatype,
    placeholder: ""
    // placeholder: `__${this.property}__`
  });
}

function VarChar<T extends string>(options: Char.Specific<T> & Char.Nullable): T | null | undefined;
function VarChar<T extends string>(options: Char.Specific<T>): T;
function VarChar(length: number, options?: Char.Nullable): string | null | undefined;
function VarChar(length: number, options?: Char.Options): string;
function VarChar(options: Char.Nullable): string | null | undefined;
function VarChar(options?: Char.Options): string;
function VarChar(
  arg1?: number | Char.Options,
  arg2?: Char.Options): any {

  if(typeof arg1 == "number")
    arg1 = { ...arg2, length: arg1 };

  return Char({ ...arg1, variable: true });
}

export default Char;
export { Char, VarChar }