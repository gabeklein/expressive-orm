import { Column } from '..';

declare namespace Char {
  interface Options extends Column.Options {
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

declare namespace Text {
  interface Options extends Column.Options {
    size?: "tiny" | "medium" | "long";
  }

  type Nullable = Options & { nullable: true };
}

function Text(options: Text.Nullable): string | null | undefined;
function Text(options?: Text.Options): string;
function Text(options: Text.Options = {}){
  const { size = "" } = options;

  const datatype = `${size.toUpperCase()}TEXT`;

  return Column({
    datatype,
    ...options
  });
}

function TinyText(options: Text.Nullable): string | null | undefined;
function TinyText(options?: Text.Options): string;
function TinyText(opts: Text.Options = {}){
  return Text({
    ...opts,
    size: "tiny"
  });
}

function MediumText(options: Text.Nullable): string | null | undefined;
function MediumText(options?: Text.Options): string;
function MediumText(opts: Text.Options = {}){
  return Text({
    ...opts,
    size: "medium"
  });
}

function LongText(options: Text.Nullable): string | null | undefined;
function LongText(options?: Text.Options): string;
function LongText(opts: Text.Options = {}){
  return Text({
    ...opts,
    size: "long"
  });
}

export { Char, VarChar, Text, TinyText, MediumText, LongText }