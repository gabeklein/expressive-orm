// @ts-nocheck 

import { Entity, Int, String } from '../src';

class Foo extends Entity {
  name = String();
  color = String();
}

class Bar extends Entity {
  name = String();
  color = String();
  rating = Int();
}

it.skip("will join in query", () => {
  Foo.query({
    where(foo){
      const bar = Bar.join("left");

      foo.name.isNot("Danny");
      bar.color.is(foo.color);
      bar.rating.isMore(50);

      return { foo, bar }; 
    },
    select({ foo, bar }){
      return {
        foo: foo.name,
        bar: bar.name
      }
    }
  })
})

it.skip("will join in query via chain", () => {
  Foo
    .where(foo => {
      const bar = Bar.join("left");

      foo.name.isNot("Danny");
      bar.color.is(foo.color);
      bar.rating.isMore(50);

      return { foo, bar }; 
    })
    .select(({ foo, bar }) => {
      return {
        foo: foo.name,
        bar: bar.name
      }
    })
})

it.skip("will join via instruction", () => {
  class Baz {
    bar = Join(() => {
      const bar = Bar.join("left");

      bar.color.is(this.color);

      return bar;
    });
  }
})

it.skip("will join using single query syntax", () => {
  Foo.query(foo => {
    const bar = Bar.join("left");

    foo.name.isNot("Danny");
    bar.color.is(foo.color);
    bar.rating.isMore(50);

    return () => ({
      foo: foo.name,
      bar: bar.name
    })
  })
})
