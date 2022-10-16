import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Enum {
  interface Options<T extends string> extends Field.Options {
    values: T[];
    multiple?: boolean;
  }

  type Nullable<T extends string> = Options<T> & { nullable: true };
}

function Enum<T extends string>(values: T[]): T;
function Enum<T extends string>(options: Enum.Nullable<T>): T | null | undefined;
function Enum<T extends string>(options: Enum.Options<T>): T;
function Enum<T extends string>(options: T[] | Enum.Options<T>){
  if(Array.isArray(options))
    options = { values: options };

  const { values, multiple, ...rest } = options;
  const type = multiple ? "SET" : "ENUM";
  const signature = values.map(x => typeof x == "string" ? `'${x}'` : x).join(',');

  return Column({
    ...rest,
    datatype: `${type}(${signature})`
  });
}

declare namespace Set {
  interface Options<T> extends Field.Options {
    values: T[];
  }

  type Optional<T> = Options<T> & { nullable: true };
}

function Set<T extends string>(values: T[]): T[];
function Set<T extends string>(options: Enum.Nullable<T>): T[] | null | undefined;
function Set<T extends string>(options: Enum.Options<T>): T[];
function Set<T extends string>(options: T[] | Enum.Options<T>){
  if(Array.isArray(options))
    options = { values: options };

  return Enum({ ...options, multiple: true });
}

export { Enum, Set }