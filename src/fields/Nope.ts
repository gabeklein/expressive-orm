import Field from '../Field';

/** Not yet implemented. */
function Nope(opts: Field.Options = {}): void {
  return NopeColumn.create(opts);
}

class NopeColumn extends Field {
  datatype = undefined;
}

export default Nope;