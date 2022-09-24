import Field from "../Field";
import Query from "../Query";

function Get<R>(factory: Query.Function<R>): R {
  return GetRelation.create({ factory })
}

class GetRelation extends Field {
  factory!: Query.Function<any>;

  proxy(query: Query<any>, proxy: {}){
    const table = query.source!;

    table.focus = proxy;
    const output = this.factory(query.interface);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export default Get;