import Field from "../Field";
import Query from "../query/Query";
import Select from "../query/Select";

function Sub<R>(factory: Select.Function<R>): R {
  return SubQueryField.create({ factory })
}

class SubQueryField extends Field {
  factory!: Select.Function<any>;

  proxy(query: Query, proxy: {}){
    query.source!.focus = proxy;
    const output = this.factory(query.interface);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export default Sub;