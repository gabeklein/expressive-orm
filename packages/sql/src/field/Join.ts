import { Field } from "./Field";
import { Query } from "../query/Query";

declare namespace Join {
  type Function<R> = (where: Query.From) => R | (() => R);
}

function Join<R>(factory: Join.Function<R>): R {
  return JoinQueryField.create({ factory });
}

class JoinQueryField extends Field {
  factory!: Join.Function<any>;

  proxy(query: Query, proxy: {}){
    query.main!.focus = proxy;
    const output = this.factory(query.where);
    
    return typeof output == "function"
      ? output
      : () => output;
  }
}

export { Join }