import { format } from 'sql-formatter';
import { describe, expect, it } from 'vitest';

import { bool, Builder, DataTable, date, num, one, Query, str, Type } from '@expressive/orm';

import { Connection } from './Connection';
import { Generator } from './Generator';

class TestConnection extends Connection {
  get schema(){
    return "";
  }

  async sync(){
    return this;
  }

  prepare(builder: Builder){
    const sql = String(new Generator(builder));

    return {
      all: async () => [],
      run: async () => 0,
      toString: () => format(sql, { keywordCase: "upper" }).replace(/`([a-zA-Z][a-zA-Z0-9_]*)`/g, "$1")
    };
  }
}

abstract class Table extends Type {}

const db = new TestConnection([Table]);

describe("select", () => {
  class Foo extends Table {
    bar = str();
    baz = str();
  }

  it("will count query by default", () => {
    class Foo extends Table {}

    const query = Query(where => void where(Foo));

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foo"
    `);
  })

  it("will select without tables", () => {
    const query = Query(where => {
      where.connection = db;

      return {
        foo: 5,
        bar: "hello",
      }
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        5 AS "foo",
        'hello' AS "bar""
    `);
  })

  it("will select via object", () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);

      return { bar, baz }
    })

    type Returns = Query.Selects<{
      bar: string;
      baz: string;
    }>

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.bar AS "bar",
        foo.baz AS "baz"
      FROM
        foo"
    `);
  })

  it("will output nested object", () => {
    const query = Query(where => {
      const { bar, baz } = where(Foo);

      return {
        bar: { value: bar },
        baz: { value: baz }
      }
    })

    type Returns = Query.Selects<{
      bar: { value: string };
      baz: { value: string };
    }>

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.bar AS "bar.value",
        foo.baz AS "baz.value"
      FROM
        foo"
    `);
  })

  it("will select a field directly", () => {
    const query = Query(where => {
      return where(Foo).bar;
    })

    type Returns = Query.Selects<string>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.bar
      FROM
        foo"
    `);
  })

  it("will select a entire entity", () => {
    const query = Query(where => {
      return where(Foo);
    })

    type Returns = Query.Selects<Query.From<Foo>>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.id AS "id",
        foo.bar AS "bar",
        foo.baz AS "baz"
      FROM
        foo"
    `);
  })
})

describe("where", () => {
  class Item extends Table  {
    number = num();
  }

  it("will limit results", async () => {
    const results = Query(where => {
      const item = where(Item);

      where(item.number).over(3);
      where(3);

      return item.number;
    });

    expect(String(results)).toMatchInlineSnapshot(`
      "SELECT
        item.number
      FROM
        item
      WHERE
        item.number > 3
      LIMIT
        3"
    `);
  });

  it("will add operator clauses", () => {
    const results = Query(where => {
      const item = where(Item);

      where(item.number).equal(5);
      where(item.number).not(0);
      where(item.number).over(4);
      where(item.number).over(5, true);
      where(item.number).under(6);
      where(item.number).under(5, true);
    });

    expect(String(results)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        item
      WHERE
        item.number = 5
        AND item.number <> 0
        AND item.number > 4
        AND item.number >= 5
        AND item.number < 6
        AND item.number <= 5"
    `);
  });

  it("will add IN clause", () => {
    const results = Query(where => {
      const item = where(Item);

      where(item.number).in([1, 2, 3]);
    });

    expect(String(results)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        item
      WHERE
        item.number IN (1, 2, 3)"
    `);
  });

  describe("grouping", () => {
    it("will chain clauses", () => {
      class Test extends Table {
        a = num();
        b = num();
        c = num();
        d = num();
      }

      const query = Query(where => {
        const test = where(Test);

        where(test.a).equal(1);
        where(test.b).not(2);
        where(test.c).over(3);
        where(test.d).under(4);
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          test
        WHERE
          test.a = 1
          AND test.b <> 2
          AND test.c > 3
          AND test.d < 4"
      `);
    })

    it("will group clauses", () => {
      class Foo extends Table {
        name = str();
        color = str();
      }

      const query = Query(where => {
        const foo = where(Foo);

        where(
          where(foo.name).equal("Gabe"),
          where(foo.color).equal("purple"),
          where(
            where(foo.color).not("orange"),
            where(foo.color).not("yellow"),
          )
        )
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          foo
        WHERE
          foo.name = 'Gabe'
          OR foo.color = 'purple'
          OR (
            foo.color <> 'orange'
            AND foo.color <> 'yellow'
          )"
      `);
    })

    it("will group recursively", () => {
      class Foo extends Table {
        name = str();
        color = str();
      }

      const query = Query(where => {
        const foo = where(Foo);

        where(foo.id).over(1);

        where(
          where(
            where(foo.name).equal("Gabe"),
            where(foo.color).equal("red"),
          ),
          where(
            where(foo.name).equal("Bob"),
            where(
              where(foo.color).equal("blue"),
              where(foo.color).equal("green")
            )
          )
        )
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          foo
        WHERE
          foo.id > 1
          AND (
            foo.name = 'Gabe'
            AND foo.color = 'red'
            OR (
              foo.name = 'Bob'
              AND (
                foo.color = 'blue'
                OR foo.color = 'green'
              )
            )
          )"
      `);
    })
  });

  describe("complex grouping", () => {
    class Item extends Table {
      name = str();
      price = num();
      color = str();
      size = str();
      inStock = bool();
    }

    it("will alternate between OR and AND groups", () => {
      const query = Query(where => {
        const item = where(Item);

        where(
          where(
            where(item.color).equal("red"),
            where(
              where(item.size).equal("small"),
              where(item.size).equal("medium")
            )
          ),
          where(
            where(item.color).equal("blue"),
            where(item.size).equal("large")
          )
        );
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          item
        WHERE
          item.color = 'red'
          AND (
            item.size = 'small'
            OR item.size = 'medium'
          )
          OR (
            item.color = 'blue'
            AND item.size = 'large'
          )"
      `);
    });

    it("will combine standalone and grouped conditions", () => {
      const query = Query(where => {
        const item = where(Item);

        // Standalone condition at query level = AND
        where(item.id).over(0);

        // Group of conditions = OR between siblings
        where(
          where(item.price).over(50),
          where(
            where(item.color).equal("red"),
            where(item.size).equal("large")
          ),
          where(item.inStock).equal(true)
        );
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          item
        WHERE
          item.id > 0
          AND (
            item.price > 50
            OR (
              item.color = 'red'
              AND item.size = 'large'
            )
            OR item.in_stock = 1
          )"
      `);
    });

    it("will collapse unnecessary nesting", () => {
      const query = Query(where => {
        const item = where(Item);

        where(
          where(
            where(item.price).over(100)
          ),
          where(item.color).equal("red"),
          where(
            where(item.size).equal("large"),
            where(item.inStock).equal(true)
          )
        );
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          COUNT(*)
        FROM
          item
        WHERE
          item.price > 100
          OR item.color = 'red'
          OR (
            item.size = 'large'
            AND item.in_stock = 1
          )"
      `);
    });
  });

  describe("sort", () => {
    class Test extends Table {
      name = str();
      rating = num();
    }

    it("will add order clause", async () => {
      const query = Query(where => {
        const test = where(Test);

        where(test.id).desc()

        return test.name;
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          test.name
        FROM
          test
        ORDER BY
          test.id desc"
      `);
    })

    it("will sort multiple columns", async () => {
      const query = Query(where => {
        const { name, rating } = where(Test);

        where(rating).asc()
        where(name).desc()

        return name;
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          test.name
        FROM
          test
        ORDER BY
          test.rating asc,
          test.name desc"
      `);

      // SQLite may not support multiple column sorting
    })  
  })
})

describe("join", () => {
  class Foo extends Table {
    name = str();
    color = str();
  }

  class Bar extends Table {
    name = str();
    color = str();
    rating = num();
  }

  class Baz extends Table {
    color = str();
    rating = num();
  }

  it("will join using function", async () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.name).not(foo.name);
      where(bar.color).equal(foo.color);

      where(foo.name).not("Danny");
      where(bar.rating).over(50);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foo
        INNER JOIN bar ON bar.name <> foo.name
        AND bar.color = foo.color
      WHERE
        foo.name <> 'Danny'
        AND bar.rating > 50"
    `);
  })

  it("will join multiple", async () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);
      const baz = where(Baz);

      where(bar.color).equal(foo.color);
      where(baz.rating).equal(bar.rating);

      where(foo.name).not("Danny");
      where(bar.rating).over(50);
      where(baz.color).equal("blue");
    });

    type Returns = Query<number>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foo
        INNER JOIN bar ON bar.color = foo.color
        INNER JOIN baz ON baz.rating = bar.rating
      WHERE
        foo.name <> 'Danny'
        AND bar.rating > 50
        AND baz.color = 'blue'"
    `);
  })

  it("will throw if joins are composed", async () => {
    const query = () => Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(
        where(bar.color).equal(foo.color)
      );
    });

    expect(query).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot use bar.color = foo.color in a group.]`);
  });

  it.skip("will filter for comparisons to later tables", async () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(foo.name).equal(bar.name);
    });

    type Returns = Query<number>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      SELECT
        COUNT(*)
      FROM
        foo
        INNER JOIN bar ON bar.color = foo.color
      WHERE
        foo.name = bar.name
    `);
  })

  it("will join a table with alias", async () => {
    class Baz extends Table {
      static schema = "other";

      color = str();
      rating = num();
    }

    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Baz);

      where(bar.color).equal(foo.color);

      return bar.rating;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        T1.rating
      FROM
        foo
        INNER JOIN other.baz T1 ON T1.color = foo.color"
    `);
  });

  it.todo("will self join", () => {});

  it("will select left join", async () => {
    class Bar extends Table {
      name = str();
      color = str();
      rating = num();
    }

    class Baz extends Table {
      rating = num();
      name = str();
    }

    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);
      const baz = where(Baz, true);

      where(bar.color).equal(foo.color);
      where(baz.rating).equal(bar.rating);

      where(foo.name).not("Danny");
      where(bar.rating).over(50);

      return {
        fooValue: foo.name,
        barValue: bar.name,
        bazRating: baz.rating
      }
    });

    type Returns = Query.Selects<{
      fooValue: string;
      barValue: string;
      bazRating: number | undefined;
    }>

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        foo.name AS "fooValue",
        bar.name AS "barValue",
        baz.rating AS "bazRating"
      FROM
        foo
        INNER JOIN bar ON bar.color = foo.color
        LEFT JOIN baz ON baz.rating = bar.rating
      WHERE
        foo.name <> 'Danny'
        AND bar.rating > 50"
    `);
  })

  it("will assert a joined property's value", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(bar.rating).equal(42);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foo
        INNER JOIN bar ON bar.color = foo.color
      WHERE
        bar.rating = 42"
    `);
  })

  it("will sort by joined table", async () => {
    class Test extends Table {
      name = str();
      rating = num();
    }

    class Other extends Table {
      name = str();
      rank = num();
    }

    const query = Query(where => {
      const test = where(Test);
      const other = where(Other);

      where(other.name).equal(test.name);
      where(other.rank).asc();

      return other.name;
    });

    type Returns = Query.Selects<string>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        other.name
      FROM
        test
        INNER JOIN other ON other.name = test.name
      ORDER BY
        other.rank asc"
    `);
  })
})

describe("computed", () => {
  class Item extends Table  {
    number = num();
  }

  describe("arithmetic", () => {
    it("will select equation", () => {
      const results = Query((where, fn) => {
        const { add } = fn;
        const item = where(Item);

        return add(item.number, 2)
      });

      expect(String(results)).toMatchInlineSnapshot(`
        "SELECT
          item.number + 2
        FROM
          item"
      `);
    })

    it("will select multiple equations", () => {
      const results = Query((where, fn) => {
        const { add, sub, mul, div } = fn;
        const item = where(Item);

        return {
          add: add(item.number, 2),
          sub: sub(item.number, 2),
          mul: mul(item.number, 2),
          div: div(item.number, 2)
        }
      });

      expect(String(results)).toMatchInlineSnapshot(`
        "SELECT
          item.number + 2 AS "add",
          item.number - 2 AS "sub",
          item.number * 2 AS "mul",
          item.number / 2 AS "div"
        FROM
          item"
      `);
    });

    it("will properly nest", async () => {
      const results = Query((where, fn) => {
        const { add, mul, neg } = fn;
        const { number } = where(Item);

        return {
          a: mul(number, add(number, 5)),
          b: add(mul(number, 5), number),
          c: neg(add(number, 100))
        }
      });

      expect(String(results)).toMatchInlineSnapshot(`
        "SELECT
          item.number * (item.number + 5) AS "a",
          item.number * 5 + item.number AS "b",
          - (item.number + 100) AS "c"
        FROM
          item"
      `);
    });
  })

  describe("templates", () => {
    it("will select", async () => {
      const results = Query((where, fn) => {
        const { number } = where(Item);

        return {
          a: fn(`${number} * (${number} + 5)`),
          b: fn(`${number} * 5 + ${number}`),
          c: fn(`-(${number} + 100)`)
        }
      });

      expect(String(results)).toMatchInlineSnapshot(`
        "SELECT
          item.number * (item.number + 5) AS "a",
          item.number * 5 + item.number AS "b",
          - (item.number + 100) AS "c"
        FROM
          item"
      `);
    });

    // it("will filter", async () => {
    //   const results = Query((where) => {
    //     const { number } = where(Item);

    //     where(`${number} * (${number} + 5)`).over(5);
    //     where(`${number} * 5 + ${number}`).under(5);
    //     where(`-(${number} + 100)`).under(-100);
    //   });

    //   expect(String(results)).toMatchInlineSnapshot();
    // });
  })
})

describe("update", () => {
  class Foo extends Table {
    value = str();
    color = str();
  }

  class Bar extends Table {
    value = str();
    color = str();
  }

  it("will generate query", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.color).equal("red");
      where(foo).update({
        value: "new!",
        color: "blue"
      })
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        foo
      SET
        value = 'new!',
        color = 'blue'
      WHERE
        foo.color = 'red'"
    `);
  })

  it("will update with joins", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(foo.color).equal("red");
      where(foo).update({ value: bar.value });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        foo
        INNER JOIN bar ON bar.color = foo.color
      SET
        value = bar.value
      WHERE
        foo.color = 'red'"
    `);
  })

  it("will complain about nullable mismatch", () => {
    class Baz extends Table {
      nullable = str({ nullable: true });
      nonNullable = str();
    }

    const query = Query(where => {
      const baz = where(Baz);
      where(baz).update({ nullable: null });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        baz
      SET
        nullable = NULL"
    `);

    const badQuery = () => Query(where => {
      const baz = where(Baz);
      // @ts-expect-error
      where(baz).update({ nonNullable: null });
    })

    expect(badQuery).toThrowErrorMatchingInlineSnapshot(
      `[Error: Column baz.non_nullable is not nullable.]`);
  })

  it.todo('will update multiple tables', () => {})
})

describe("delete", () => {
  class Foo extends Table {
    value = str();
    color = str();
  }

  class Bar extends Table {
    value = str();
    color = str();
  }

  it("will generate query", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.value).equal("Hello World!");
      where(foo).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "DELETE FROM
        foo
      WHERE
        foo.value = 'Hello World!'"
    `);
  })

  it("will include FROM statement where JOIN exists", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(bar.value).equal("Hello World!");

      where(foo).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "DELETE foo
      FROM
        foo
        INNER JOIN bar ON bar.color = foo.color
      WHERE
        bar.value = 'Hello World!'"
    `);
  })
})

describe("template", () => {
  it("will preprocess params", async () => {
    class Thing extends Table {
      created = date();
    }

    const template = Query(where => (created: Date) => {
      const thing = where(Thing);
      where(thing.created).equal(created);
    });

    const query = template(new Date("2020-01-01"));

    expect(query.params).toEqual(['2020-01-01T00:00:00.000Z']);
  });
})

describe("relations", () => {
  class A extends Table {
    b = one(B);
    value = str();
  }

  class B extends Table {
    c = one(C);
    value = str();
  }

  class C extends Table {
    value = num();
    label = str();
  }

  it("will query via direct selection", () => {
    const query = Query(where => {
      return where(A).b.value;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        b.value
      FROM
        a
        INNER JOIN b ON b.id = a.b_id"
    `);
  })

  it("will select via an object", () => {
    const query = Query(where => {
      const a = where(A);

      return {
        aValue: a.value,
        cValue: a.b.c.value
      }
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        a.value AS "aValue",
        c.value AS "cValue"
      FROM
        a
        INNER JOIN b ON b.id = a.b_id
        INNER JOIN c ON c.id = b.c_id"
    `);
  })

  it("will query nested relationships", () => {
    const query = Query(where => {
      const a = where(A);

      where(a.b.c.value).equal(100);

      return a.b.c.label;
    })

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        c.label
      FROM
        a
        INNER JOIN b ON b.id = a.b_id
        INNER JOIN c ON c.id = b.c_id
      WHERE
        c.value = 100"
    `);
  })

  // it("will join on id if type is passed", async () => {
  //   class Foo extends Table {
  //     name = str();
  //   }

  //   class Bar extends Table {
  //     foo = one(Foo);
  //     rating = num();
  //   }

  //   const query = Query(where => {
  //     const foo = where(Foo);
  //     const bar = where(Bar, () => {
  //       where(bar.foo).equal(foo);
  //     });

  //     where(bar.rating).over(50);

  //     return foo.name;
  //   });

  //   expect(String(query)).toMatchInlineSnapshot(`
  //     SELECT
  //       foo.name
  //     FROM
  //       foo
  //       INNER JOIN bar ON bar.foo_id = foo.id
  //     WHERE
  //       bar.rating > 50
  //   `);
  // });

  it("will assert a property-joined value", () => {
    class Foo extends Table {
      name = str();
      color = str();
    }

    class Bar extends Table {
      foo = one(Foo);
    }

    const query = Query(where => {
      const bar = where(Bar);

      where(bar.foo.color).equal("blue");
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        bar
        INNER JOIN foo ON foo.id = bar.foo_id
      WHERE
        foo.color = 'blue'"
    `);
  })
})

describe("schema", () => {
  it("will alias types with a schema", () => {
    class Foo extends Table {
      static schema = "foobar";

      name = str();
      color = str();
    }

    const query = Query(where => {
      const foo = where(Foo);

      where(foo.color).equal("red");
    })

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foobar.foo T0
      WHERE
        T0.color = 'red'"
    `);
  })
})

describe("type", () => {
  class Item extends Table  {
    number = num();
  }

  describe("get method", () => {
    it("will fetch rows", async () => {
      const query = Item.query();

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          item.id AS "id",
          item.number AS "number"
        FROM
          item"
      `);
    })

    it("will limit rows", async () => {
      const query = Item.query((_item, where) => {
        where(5);
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          item.id AS "id",
          item.number AS "number"
        FROM
          item
        LIMIT
          5"
      `);
    })

    it("will query rows", async () => {
      const query = Item.query((item, where) => {
        where(item.number).over(5);
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          item.id AS "id",
          item.number AS "number"
        FROM
          item
        WHERE
          item.number > 5"
      `);
    })

    it("will limit queried rows", async () => {
      const query =  Item.query((item, where) => {
        where(item.number).over(5);
        where(2);
      });

      expect(String(query)).toMatchInlineSnapshot(`
        "SELECT
          item.id AS "id",
          item.number AS "number"
        FROM
          item
        WHERE
          item.number > 5
        LIMIT
          2"
      `);
    })
  })
})

describe("generator", () => {
  class Foo extends Table {
    name = str();
    rank = num({ nullable: true });
  }

  class Bar extends Table {
    foo = one(Foo);
    color = str();
  }

  it("will insert from a joined table", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar, { foo: foo.id, color: "red" });

      where(foo.name).equal("Gabe");

      return bar.id;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        bar (foo_id, color)
      SELECT
        foo.id,
        'red'
      FROM
        foo
      WHERE
        foo.name = 'Gabe' RETURNING bar.id"
    `);
  })

  it("will escape updated strings", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo).update({ name: "it's\n\r\b\t\\\"\x1a\0\x01" });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        foo
      SET
        name = 'it\\'s\\n\\r\\b\\t\\\\\\"\\Z\\0\\x01'"
    `);
  })

  it("will compare to null", () => {
    const query = Query(where => {
      const { rank } = where(Foo);

      where(rank).equal(null);
      where(rank).not(null);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        foo
      WHERE
        foo.rank IS NULL
        AND foo.rank IS NOT NULL"
    `);
  })

  it("will throw comparing null by order", () => {
    expect(() => Query(where => {
      where(where(Foo).rank).over(null);
    })).toThrow("Cannot compare NULL with >");
  })

  it("will throw for a table without joins", () => {
    expect(() => Query(where => {
      where(Foo);
      where(Bar);
    })).toThrow("Table bar has no joins.");
  })

  it("will throw for an empty update", () => {
    expect(() => Query(where => {
      where(where(Foo)).update({});
    })).toThrow("Update contains no values.");
  })

  it("will throw for a multi-table update", () => {
    expect(() => Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.name);
      where(foo).update({ name: "a" });
      where(bar).update({ color: "b" });
    })).toThrow("Engine does not support multi-table updates.");
  })

  it("will throw for data without a dialect", () => {
    expect(() => Query(where => {
      const input = where([{ name: "Gabe" }]);
      const foo = where(Foo);

      where(foo.name).equal(input.name);
    })).toThrow("Not implemented.");
  })

  it("will render data through a dialect", () => {
    class Dialect extends Generator {
      protected jsonTable(table: DataTable){
        return `SELECT * FROM rows(${this.param(table)})`;
      }
    }

    class Loose extends Type {
      name = str();
    }

    let builder!: Builder;

    Query(function(where){
      builder = this;

      const loose = where(Loose);
      const input = where([{ name: "Gabe" }]);

      where(loose.name).equal(input.name);

      return loose.id;
    });

    expect(String(new Dialect(builder))).toMatchInlineSnapshot(`"WITH \`input\` AS (SELECT * FROM rows(?)) SELECT \`loose\`.\`id\` FROM \`loose\` INNER JOIN \`input\` ON \`loose\`.\`name\` = \`input\`.\`name\`"`);
  })
})
