import Field from '../Field';

declare namespace Flags {
  interface Options<T> extends Field.Options {
    values: T[];
  }

  interface Optional<T> extends Options<T> {
    nullable?: true;
  }
}

function Flags<T>(values: T[]): T[];
function Flags<T>(options: Flags.Optional<T>): T[] | null | undefined;
function Flags<T>(options: Flags.Options<T>): T[];
function Flags<T>(options: T[] | Flags.Options<T>){
  const { values, ...rest } =
    Array.isArray(options)
      ? { values: options }
      : options;

  const datatype = `SET(${
    values.map(x => typeof x == "string" ? `'${x}'` : x).join(',')
  })`

  return SetColumn.create({ ...rest, datatype, values });
}

class SetColumn extends Field {
  values = [] as any[];
  placeholder = [];
}

export default Flags;