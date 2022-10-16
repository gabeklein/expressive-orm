import Field from "../Field";
import Query from "../query/Query";

function Join<R>(factory: Query.Function<R>): R {
  return JoinQueryField.create({ factory });
}

class JoinQueryField extends Field {
  factory!: Query.Function<any>;

  proxy(query: Query, proxy: {}){
    query.main!.focus = proxy;
    const output = this.factory(query.where);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export default Join;