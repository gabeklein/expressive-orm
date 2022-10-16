import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Enum {
  interface Options<T extends string> extends Field.Options {
    values: T[];
  }

  type Nullable<T extends string> = Options<T> & { nullable: true };
}

function Enum<T extends string>(values: T[]): T;
function Enum<T extends string>(options: Enum.Nullable<T>): T | null | undefined;
function Enum<T extends string>(options: Enum.Options<T>): T;
function Enum<T extends string>(options: T[] | Enum.Options<T>){
  const { values, ...rest } =
    Array.isArray(options)
      ? { values: options }
      : options;

  const datatype = `ENUM(${
    values.map(x => typeof x == "string" ? `'${x}'` : x).join(',')
  })`

  return Column({
    ...rest,
    datatype,
    placeholder: ""
  });
}

export default Enum;