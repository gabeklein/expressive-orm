import { Num, One, Query, Str, Type } from '../src';

class Foo extends Type {
  bar = Str();
  baz = Str();
}

describe("where.selects", () => {
  it("will select via object", () => {
    const query = new Query(where => {
      const { bar, baz } = where(Foo);
  
      return where.selects({ bar, baz })
    })
  
    expect(query).toMatchSnapshot();
  })
  
  it("will select via map function", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.selects(() => ({
        bar: foo.bar,
        baz: foo.baz
      }));
    })
  
    expect(query).toMatchSnapshot();
  })
  
  it("will select a field directly", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.selects(foo.bar);
    })
  
    expect(query).toMatchSnapshot();
  })
  
  it("will select a entire entity", () => {
    const query = new Query(where => {
      const foo = where(Foo);
  
      return where.selects(foo);
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
  class Foo extends Type {
    name = Str();
    color = Str();
  }

  it("will select joined values", async () => {
    class Bar extends Type {
      name = Str();
      color = Str();
      rating = Num();
    }
    
    class Baz extends Type {
      rating = Num();
    }
  
    const query = new Query(where => {
      const foo = where(Foo);
      const bar = where(Bar, { color: foo.color });
      const baz = where(Baz, "left", { rating: bar.rating });
  
      where(foo.name).isNot("Danny");
      where(bar.rating).isMore(50);
  
      return where.selects({
        fooValue: foo.name,
        barValue: bar.name,
        bazRating: baz.rating
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will select implicit joined values", async () => {
    class Bar extends Type {
      name = Str();
      foo = One(Foo);
    }
  
    const query = new Query(where => {
      const bar = where(Bar);
  
      return where.selects(bar.foo.name)
    });
  
    expect(query).toMatchSnapshot();
  })
})

describe("sort", () => {
  class Test extends Type {
    id = Num();
    rating = Num();
    name = Str();
  }

  it("will add order clause", async () => {
    const query = new Query(where => {
      const test = where(Test);
  
      where.sorts(test.id, "asc");
  
      return where.selects({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will add multiple clauses", async () => {
    const query = new Query(where => {
      const test = where(Test);
  
      where.sorts(test.rating, "asc");
      where.sorts(test.name, "asc");
  
      return where.selects({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

  it("will sort by joined table", async () => {
    class Other extends Type {
      name = Str();
      rank = Num();
    }

    const query = new Query(where => {
      const test = where(Test);
      const other = where(Other, {
        name: test.name
      })
  
      where.sorts(other.rank, "asc");
  
      return where.selects({
        name: test.name
      })
    });
  
    expect(query).toMatchSnapshot();
  })

})