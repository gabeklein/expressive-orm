import Field from '../../Field';
import Column from '../../fields/Column';

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

  return Column({
    ...rest,
    datatype,
    placeholder: []
  });
}

export default Flags;