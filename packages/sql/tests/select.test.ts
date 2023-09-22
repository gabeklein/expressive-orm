import { Entity, Number, One, Query, String } from '../src';

class Foo extends Entity {
  bar = String();
  baz = String();
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
  
  it("will select a entire entity", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.get(foo);
    })
  
    expect(query).toMatchSnapshot();
  })
})

describe("where.one", () => {
  it("will limit results", () => {
    const query = new Query(where => {
      const { bar, baz } = where(Foo);
  
      return where.one({ bar, baz })
    })
  
    expect(query).toMatchSnapshot();
  })
})

describe("joins", () => {
  class Foo extends Entity {
    name = String();
    color = String();
  }

  it("will select joined values", async () => {
    class Bar extends Entity {
      name = String();
      color = String();
      rating = Number();
    }
    
    class Baz extends Entity {
      rating = Number();
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
      name = String();
      foo = One(Foo);
    }
  
    const query = new Query(where => {
      const bar = where(Bar);
  
      return where.get(bar.foo.name)
    });
  
    expect(query).toMatchSnapshot();
  })
})

describe("sort", () => {
  class Test extends Entity {
    id = Number();
    rating = Number();
    name = String();
  }

  it("will add order clause", async () => {
    const query = new Query(where => {
      const test = where(Test);
  
      where.sort(test.id, "asc");
  
      return where.get({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will add multiple clauses", async () => {
    const query = new Query(where => {
      const test = where(Test);
  
      where.sort(test.rating, "asc");
      where.sort(test.name, "asc");
  
      return where.get({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will sort by joined table", async () => {
    class Other extends Entity {
      name = String();
      rank = Number();
    }

    const query = new Query(where => {
      const test = where(Test);
      const other = where(Other, {
        name: test.name
      })
  
      where.sort(other.rank, "asc");
  
      return where.get({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

})