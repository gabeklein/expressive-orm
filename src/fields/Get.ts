import Field from "../Field";
import Query from "../query/Query";
import Select from "../query/Select";

function Get<R>(factory: Select.Function<R>): R {
  return GetRelation.create({ factory })
}

class GetRelation extends Field {
  factory!: Select.Function<any>;

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