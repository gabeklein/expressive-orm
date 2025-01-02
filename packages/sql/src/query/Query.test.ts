import { Query } from "./Query";

it("will expose Builder as this", () => {
  Query(function(){
    expect<Query.Builder>(this).toBeInstanceOf(Query.Builder);
  });
})