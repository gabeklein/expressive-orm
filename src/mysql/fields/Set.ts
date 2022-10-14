import Field from '../../Field';
import Column from '../../fields/Column';

declare namespace Set {
  interface Options<T> extends Field.Options {
    values: T[];
  }

  interface Optional<T> extends Options<T> {
    nullable?: true;
  }
}

function Set<T>(values: T[]): T[];
function Set<T>(options: Set.Optional<T>): T[] | null | undefined;
function Set<T>(options: Set.Options<T>): T[];
function Set<T>(options: T[] | Set.Options<T>){
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

export default Set;