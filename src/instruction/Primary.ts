import Field, { TYPE, WHERE } from './Field';

declare namespace Primary {
  type Key = (number | string) & MetaData;

  interface MetaData {
    [TYPE]?: PrimaryKeyColumn;
    [WHERE]?: Field.Where<number>;
  }

  interface Options {
    column?: string;
  }
}

function Primary(): Primary.Key;
function Primary(column: string, options?: Primary.Options): Primary.Key;
function Primary(options: Primary.Options): Primary.Key;
function Primary(arg1?: any, arg2?: any){
  if(typeof arg1 == "string")
    arg1 = { column: arg1 };

  return PrimaryKeyColumn.create({ ...arg2, ...arg1 });
}

export class PrimaryKeyColumn extends Field {}

export default Primary;