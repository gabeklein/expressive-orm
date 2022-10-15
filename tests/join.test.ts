import { Column, Entity, Query, Table } from '../src';

class Foo extends Entity {
  name = Column();
  color = Column();
}

it("will join using single query syntax", async () => {
  class Bar extends Entity {
    name = Column();
    color = Column();
    rating = Column();
  }
  
  class Baz extends Entity {
    color = Column();
    rating = Column();
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

it("will alias tables which have a schema", () => {
  class Foo extends Entity {
    this = Table({
      schema: "foobar"
    })

    name = Column();
    color = Column();
  }

  const query = new Query(where => {
    const foo = where(Foo);

    where(foo.color).is("red");
  })

  expect(query).toMatchSnapshot();
})