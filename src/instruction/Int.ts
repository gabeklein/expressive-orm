import Field from '../Field';

declare namespace Int {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: number;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable?: true;
  }
}

function Int(): number;
function Int(options: Int.Optional): number | null | undefined;
function Int(options: Int.Options): number;
function Int(options: Int.Options = {}){
  return IntergerColumn.create(options);
}

class IntergerColumn extends Field {
  datatype = "INT";
  placeholder = Infinity;
}

export default Int;