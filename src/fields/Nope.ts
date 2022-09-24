import Field from '../Field';

declare namespace Nope {
  interface Options {
    column?: string;
    unique?: boolean;
    default?: string;
    nullable?: boolean;
  }

  interface Optional extends Options {
    nullable: true;
  }
}

/** Not yet implemented. */
function Nope(opts: Nope.Options = {}): void {
  return NopeColumn.create(opts);
}

class NopeColumn extends Field {
  datatype = undefined;
}

export default Nope;