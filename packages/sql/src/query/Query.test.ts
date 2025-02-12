import { Builder } from "./Builder";
import { Query } from "./Query";

it("will expose Builder as this", () => {
  Query(function(){
    expect<Builder>(this).toBeInstanceOf(Query.Builder);
  });
})