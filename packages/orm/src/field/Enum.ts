import Field from '../Field';

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
  if(Array.isArray(options))
    options = { values: options };

  const { values, ...rest } = options;
  const signature = values
    .map(value => (
      typeof value == "string" ? `'${value}'` : value
    ))
    .join(',');

  return Field.create({
    ...rest,
    datatype: `ENUM(${signature})`
  });
}

export default Enum;