import Field from '../Field';

declare namespace Primary {
  interface Options {
    column?: string;
    datatype?: string;
  }
}

function Primary(use: false): 0;
function Primary(type: "int" | "tinyint" | "smallint" | "bigint"): number;
function Primary(type: "varchar"): string;
function Primary(options?: Primary.Options): number | string;
function Primary(arg1?: false | string | Primary.Options){
  if(arg1 === false)
    return 0;
  else if(typeof arg1 == "string")
    arg1 = {
      datatype: arg1
    }

  return PrimaryKeyColumn.create(arg1);
}

export class PrimaryKeyColumn extends Field {
  datatype = "INT";
  placeholder = 1;
  primary = true;
  increment = true;
}

export default Primary;