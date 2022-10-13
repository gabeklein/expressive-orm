import Field from "../Field";
import Query from "../query/Query";

function Sub<R>(factory: Query.Function<R>): R {
  return SubQueryField.create({ factory })
}

class SubQueryField extends Field {
  factory!: Query.Function<any>;

  proxy(query: Query, proxy: {}){
    query.main!.focus = proxy;
    const output = this.factory(query.where);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export default Sub;