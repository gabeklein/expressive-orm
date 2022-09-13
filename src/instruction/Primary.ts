import Field from '../Field';

declare namespace Primary {
  interface Options {
    column?: string;
  }
}

function Primary(use: false): 0;
function Primary(options?: Primary.Options): number | string;
function Primary(arg1?: any){
  if(arg1 === false)
    return 0;

  return PrimaryKeyColumn.create(arg1);
}

export class PrimaryKeyColumn extends Field {
  datatype = "INT";
  placeholder = 1;
  primary = true;
  increment = true;
}

export default Primary;