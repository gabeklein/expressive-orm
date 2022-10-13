import { Entity, Int, Query, Table, VarChar } from '../src';

class Foo extends Entity {
  name = VarChar();
  color = VarChar();
}

it("will join using single query syntax", async () => {
  class Bar extends Entity {
    name = VarChar();
    color = VarChar();
    rating = Int();
  }
  
  class Baz extends Entity {
    color = VarChar();
    rating = Int();
  }

  const query = new Query(where => {
    const foo = where(Foo);
    const bar = where(Bar, { color: foo.color });
    const baz = where(Baz, { rating: bar.rating });

    where(foo.name).not("Danny");
    where(bar.rating).greater(50);
    where(baz.color).is("blue");
  });

  expect(query).toMatchSnapshot();
})

it("will alias tables with a schema", () => {
  class Foo extends Entity {
    this = Table({
      name: "foo",
      schema: "foobar"
    })

    name = VarChar();
    color = VarChar();
  }

  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  })

  expect(query).toMatchSnapshot();
})