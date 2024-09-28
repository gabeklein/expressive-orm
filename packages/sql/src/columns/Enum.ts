import { Field } from '../Field';

declare namespace Enum {
  interface OrNull<T extends string> extends Enum<T> {
    nullable: true;
  }
}

interface Enum<T extends string> extends Field {
  values: T[];
}

function Enum<T extends string>(values: T[]): T;
function Enum<T extends string>(options: Enum.OrNull<T>): T | null | undefined;
function Enum<T extends string>(options: Enum<T>): T;
function Enum<T extends string>(options: T[] | Enum<T>){
  if(Array.isArray(options))
    options = { values: options };

  const { values, ...rest } = options;
  const signature = values
    .map(value => (
      typeof value == "string" ? `'${value}'` : value
    ))
    .join(',');

  return Field({
    ...rest,
    datatype: `ENUM(${signature})`
  });
}

export { Enum }