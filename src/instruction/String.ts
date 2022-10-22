import Column from './Column';

declare namespace String {
  type DataType =
    | "char"
    | "varchar"
    | "nchar"
    | "nvarchar"
    | "text"
    | "tinytext"
    | "mediumtext"
    | "longtext";

  interface Options extends Column.Options {
    datatype?: DataType;
    length?: number;
    oneOf?: any[];
    variable?: boolean;
  }

  interface Specific<T extends string> extends Options {
    oneOf: T[];
  }

  type Nullable = Options & { nullable: true };
}

function String<T extends string>(options: String.Specific<T> & String.Nullable): T | null | undefined;
function String<T extends string>(options?: String.Specific<T>): T;
function String(length: number, options: String.Nullable): string | null | undefined;
function String(length: number, options?: String.Options): string;
function String(options: String.Nullable): string | null | undefined;
function String(options?: String.Options): string;
function String(
  opts: number | String.Options = {},
  arg2?: String.Options): any {

  if(typeof opts == "number")
    opts = { ...arg2, length: opts };

  // const datatype =
  //   `${opts.variable ? "VAR" : ""}CHAR(${opts.length || 255})`;

  let datatype: string = opts.datatype || "varchar";

  if(datatype && datatype.includes("char"))
    datatype = `${datatype}(${opts.length || 255})`

  return Column({
    ...opts,
    datatype: datatype.toUpperCase(),
    placeholder: ""
  });
}

export { String };