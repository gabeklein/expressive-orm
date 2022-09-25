import Field from "../Field";
import Query from "../Query";

function Get<R>(factory: Query.Select<R>): R {
  return GetRelation.create({ factory })
}

class GetRelation extends Field {
  factory!: Query.Select<any>;

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