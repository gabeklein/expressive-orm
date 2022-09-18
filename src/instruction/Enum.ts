import Field from '../Field';

declare namespace Enum {
  interface Options<T> {
    column?: string;
    nullable?: boolean;
    values: T[];
  }

  interface Optional<T> extends Options<T> {
    nullable?: true;
  }
}

function Enum<T>(values: T[]): T;
function Enum<T>(options: Enum.Optional<T>): T | null | undefined;
function Enum<T>(options: Enum.Options<T>): T;
function Enum<T>(options: T[] | Enum.Options<T>){
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
  values = [] as any[];
  placeholder = "";
}

export default Enum;