import Entity, { Column, One, Query } from '../src';

class Foo extends Entity {
  bar = Column();
  baz = Column();
}

describe("where.get", () => {
  it("will select via object", () => {
    const query = new Query(where => {
      const { bar, baz } = where(Foo);
  
      return where.get({ bar, baz })
    })
  
    expect(query).toMatchSnapshot();
  })
  
  it("will select via map function", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.get(() => ({
        bar: foo.bar,
        baz: foo.baz
      }));
    })
  
    expect(query).toMatchSnapshot();
  })
  
  it("will select a field directly", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.get(foo.bar);
    })
  
    expect(query).toMatchSnapshot();
  })
})

describe("joins", () => {
  class Foo extends Entity {
    name = Column();
    color = Column();
  }

  it("will select joined values", async () => {
    class Bar extends Entity {
      name = Column();
      color = Column();
      rating = Column();
    }
    
    class Baz extends Entity {
      rating = Column();
    }
  
    const query = new Query(where => {
      const foo = where(Foo);
      const bar = where(Bar, { color: foo.color });
      const baz = where(Baz, "left", { rating: bar.rating });
  
      where(foo.name).not("Danny");
      where(bar.rating).greater(50);
  
      return where.get({
        fooValue: foo.name,
        barValue: bar.name,
        bazRating: baz.rating
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will select implicit joined values", async () => {
    class Bar extends Entity {
      name = Column();
      foo = One(Foo);
    }
  
    const query = new Query(where => {
      const bar = where(Bar);
  
      return where.get(bar.foo.name)
    });
  
    expect(query).toMatchSnapshot();
  })
})
