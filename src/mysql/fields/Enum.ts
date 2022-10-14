import Field from '../../Field';

declare namespace Enum {
  interface Options<T extends string> extends Field.Options {
    values: T[];
  }

  interface Optional<T extends string> extends Options<T> {
    nullable?: true;
  }
}

function Enum<T extends string>(values: T[]): T;
function Enum<T extends string>(options: Enum.Optional<T>): T | null | undefined;
function Enum<T extends string>(options: Enum.Options<T>): T;
function Enum<T extends string>(options: T[] | Enum.Options<T>){
  const { values, ...rest } =
    Array.isArray(options)
      ? { values: options }
      : options;

  const datatype = `ENUM(${
    values.map(x => typeof x == "string" ? `'${x}'` : x).join(',')
  })`

  return EnumColumn.create({ ...rest, datatype, values });
}

class EnumColumn extends Field {
  values = [] as readonly any[];
  placeholder = "";
}

export default Enum;