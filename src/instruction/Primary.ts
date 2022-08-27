import Query from '../Query';
import Field, { SELECT, TYPE, WHERE } from '../Field';

declare namespace Primary {
  type Key = (number | string) & MetaData;

  interface MetaData {
    [TYPE]?: PrimaryKeyColumn;
    [WHERE]?: Field.Where<number>;
    [SELECT]?: number;
  }

  interface Options {
    column?: string;
  }
}

function Primary(): Primary.Key;
function Primary(use: false): 0;
function Primary(column: string, options?: Primary.Options): Primary.Key;
function Primary(options: Primary.Options): Primary.Key;
function Primary(arg1?: any, arg2?: any){
  if(arg1 === false)
    return 0;

  if(typeof arg1 == "string")
    arg1 = { ...arg2, column: arg1 };

  return PrimaryKeyColumn.create(arg1);
}

export class PrimaryKeyColumn extends Field {
  datatype = "INT";
  placeholder = 1;
  primary = true;
  increment = true;

  where!: (query: Query<any>, parent?: string) => Field.Where<number>;
  select!: (query: Query<any>, path: string[], prefix?: string) => number;
}

export default Primary;