import Field from "../Field";
import Query from "../Query";

function Get<R>(query: Query.Function<R>): R {
  return GetRelation.create({ query })
}

class GetRelation extends Field {
  query!: Query.Function<any>;

  proxy(query: Query<any>, proxy: {}){
    const table = query.source!;

    table.focus = proxy;
    const output = this.query(query);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export default Get;