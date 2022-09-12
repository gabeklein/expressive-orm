import Field from '../Field';

declare namespace Primary {
  interface Options {
    column?: string;
  }
}

function Primary(): number | string;
function Primary(use: false): 0;
function Primary(column: string, options?: Primary.Options): number | string;
function Primary(options: Primary.Options): number | string;
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
}

export default Primary;