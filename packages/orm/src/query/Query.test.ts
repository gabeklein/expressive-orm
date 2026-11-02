import { describe, expect, it } from 'vitest';

import { Field } from '../Field';
import { bool, num, str } from '../fields';
import { memory } from '../memory';
import { one } from '../one';
import { Type } from '../Type';
import { Builder } from './Builder';
import { Query } from './Query';

function connect(){
  return class Table extends Type {
    static connection = memory();
  }
}

async function seed<T extends Type>(type: Type.Class<T>, ...rows: Type.Insert<T>[]){
  const out: T[] = [];

  for (const row of rows)
    out.push(await type.insert(row));

  return out;
}

it("will expose Builder as this", () => {
  Query(function(){
    expect<Builder>(this).toBeInstanceOf(Query.Builder);
  });
})

describe("select", () => {
  class Foo extends connect() {
    static table = "foo";
    bar = str();
    baz = str();
  }

  const ready = seed(Foo, { bar: "hello", baz: "world" }, { bar: "goodbye", baz: "moon" });

  it("will count by default", async () => {
    await ready;
    const query = Query(where => void where(Foo));

    expect<Query<number>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select count"
    `);
    await expect(query).resolves.toBe(2);
  })

  it("will select via object", async () => {
    await ready;
    const query = Query(where => {
      const { bar, baz } = where(Foo);
      return { bar, baz };
    });

    type Returns = Query.Selects<{
      bar: string;
      baz: string;
    }>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select
        bar: foo.bar
        baz: foo.baz"
    `);
    await expect(query).resolves.toEqual([
      { bar: "hello", baz: "world" },
      { bar: "goodbye", baz: "moon" }
    ]);
  })

  it("will output nested object", async () => {
    await ready;
    const query = Query(where => {
      const { bar, baz } = where(Foo);

      return {
        bar: { value: bar },
        baz: { value: baz }
      };
    });

    type Returns = Query.Selects<{
      bar: { value: string };
      baz: { value: string };
    }>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select
        bar.value: foo.bar
        baz.value: foo.baz"
    `);
    await expect(query.one()).resolves.toEqual({
      bar: { value: "hello" },
      baz: { value: "world" }
    });
  })

  it("will select a field directly", async () => {
    await ready;
    const query = Query(where => where(Foo).bar);

    expect<Query.Selects<string>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select foo.bar"
    `);
    await expect(query.get()).resolves.toEqual(["hello", "goodbye"]);
  })

  it("will select an entire entity", async () => {
    await ready;
    const query = Query(where => where(Foo));

    expect<Query.Selects<Foo>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select foo"
    `);

    const [first, second] = await query;

    expect(first).toBeInstanceOf(Foo);
    expect(first.columns).toEqual({ id: 1, bar: "hello", baz: "world" });
    expect(second.bar).toBe("goodbye");
    await expect(Foo.one(1)).resolves.toBe(first);
  })

  it("will not select absent fields", async () => {
    class Bar extends connect() {
      static table = "bar";
      name = str();
      extra = str({ absent: true, optional: true });
    }

    await Bar.insert({ name: "Bob" });

    const query = Query(where => where(Bar));
    const [bar] = await query;

    expect(String(query)).toMatchInlineSnapshot(`
      "from bar
      select bar"
    `);
    expect(bar.name).toBe("Bob");
  })

  it("will select without tables", async () => {
    const query = Query(() => ({ foo: 5, bar: "hello" }));

    expect(String(query)).toMatchInlineSnapshot(`
      "select
        foo: 5
        bar: "hello""
    `);
    await expect(query).rejects.toThrow("Query needs a connection with prepare() to run.");
  })

  it("will return one row", async () => {
    await ready;
    const query = Query(where => {
      const foo = where(Foo);
      where(foo.bar).equal("nope");
      return foo.bar;
    });

    await expect(query.one()).resolves.toBeUndefined();
    await expect(query.one(true)).rejects.toThrow("Query returned no results.");
  })
})

describe("where", () => {
  class Item extends connect() {
    static table = "item";
    number = num();
    label = str(null);
  }

  const ready = seed(Item,
    { number: 1, label: "one" },
    { number: 2 },
    { number: 3, label: "three" },
    { number: 4 },
    { number: 5, label: "five" },
    { number: 6 }
  );

  it("will limit results", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);

      where(item.number).over(1);
      where(3);

      return item.number;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number > 1
      limit 3
      select item.number"
    `);
    await expect(query).resolves.toEqual([2, 3, 4]);
  })

  it("will offset results", async () => {
    await ready;
    const query = Query(function(where){
      const item = where(Item);

      where(item.number).over(1);
      where(2);
      this.offset = 1;

      return item.number;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number > 1
      limit 2
      offset 1
      select item.number"
    `);
    await expect(query).resolves.toEqual([3, 4]);
  })

  it("will add operator clauses", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);

      where(item.number).not(0);
      where(item.number).over(1);
      where(item.number).over(2, true);
      where(item.number).under(6);
      where(item.number).under(5, true);

      return item.number;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number <> 0
      where item.number > 1
      where item.number >= 2
      where item.number < 6
      where item.number <= 5
      select item.number"
    `);
    await expect(query).resolves.toEqual([2, 3, 4, 5]);
  })

  it("will add IN clause", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);
      where(item.number).in([1, 3, 7]);
      return item.number;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number IN [1,3,7]
      select item.number"
    `);
    await expect(query).resolves.toEqual([1, 3]);
  })

  it("will compare with null", async () => {
    await ready;
    const isNull = Query(where => {
      const item = where(Item);
      where(item.label).equal(null);
      return item.number;
    });

    const notNull = Query(where => {
      const item = where(Item);
      where(item.label).not(null);
      return item.number;
    });

    const over = Query(where => {
      const item = where(Item);
      where(item.label).over(null);
    });

    expect(String(isNull)).toMatchInlineSnapshot(`
      "from item
      where item.label = null
      select item.number"
    `);
    await expect(isNull).resolves.toEqual([2, 4, 6]);
    await expect(notNull).resolves.toEqual([1, 3, 5]);
    await expect(over).resolves.toBe(0);
  })

  it("will not match null against a value", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);
      where(item.label).not("one");
    });

    await expect(query).resolves.toBe(2);
  })

  it("will throw on null for non-nullable", () => {
    const query = () => Query(where => {
      const item = where(Item);
      where(item.number).equal(null as any);
    });

    expect(query).toThrow("Column item.number is not nullable.");
  })

  it("will throw on unsupported operator", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);
      (where(item.number).equal as any)(1, true);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number == 1
      select count"
    `);
    await expect(query).rejects.toThrow("Unsupported operator: ==");
  })

  it("will throw on unknown argument", () => {
    expect(() => Query(where => void (where as any)({}))).toThrow("Argument [object Object] is not a query argument.");
    expect(() => Query(where => void (where as any)(undefined))).toThrow("Argument undefined is not a query argument.");
  })

  it("will throw if joins are grouped", () => {
    class Other extends Item {
      static table = "other";
      number = num();
    }

    const query = () => Query(where => {
      const item = where(Item);
      const other = where(Other);

      where(
        where(other.number).equal(item.number)
      );
    });

    expect(query).toThrow("Cannot use other.number = item.number in a group.");
  })
})

describe("grouping", () => {
  class Item extends connect() {
    static table = "item";
    name = str();
    color = str();
    size = str();
    inStock = bool();
  }

  const ready = seed(Item,
    { name: "a", color: "red", size: "small", inStock: true },
    { name: "b", color: "red", size: "large", inStock: false },
    { name: "c", color: "blue", size: "large", inStock: true },
    { name: "d", color: "blue", size: "medium", inStock: false },
    { name: "e", color: "green", size: "medium", inStock: false }
  );

  it("will group clauses", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);

      where(
        where(item.name).equal("a"),
        where(item.color).equal("blue"),
        where(
          where(item.color).not("red"),
          where(item.color).not("blue"),
        )
      );

      return item.name;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.name = "a" or item.color = "blue" or (item.color <> "red" and item.color <> "blue")
      select item.name"
    `);
    await expect(query).resolves.toEqual(["a", "c", "d", "e"]);
  })

  it("will alternate between OR and AND groups", async () => {
    await ready;
    const query = Query(where => {
      const item = where(Item);

      where(item.id).over(0);
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
          where(item.inStock).equal(true)
        ),
        where(
          where(item.name).equal("e")
        )
      );

      return item.name;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.id > 0
      where (item.color = "red" and (item.size = "small" or item.size = "medium")) or (item.color = "blue" and item.in_stock = true) or item.name = "e"
      select item.name"
    `);
    await expect(query).resolves.toEqual(["a", "c", "e"]);
  })
})

describe("order", () => {
  class Test extends connect() {
    static table = "test";
    name = str();
    rating = num(null);
  }

  const ready = seed(Test,
    { name: "b", rating: 2 },
    { name: "a", rating: 2 },
    { name: "c" },
    { name: "d", rating: 1 }
  );

  it("will sort multiple columns", async () => {
    await ready;
    const query = Query(where => {
      const { name, rating } = where(Test);

      where(rating).asc();
      where(name).desc();

      return name;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from test
      order test.rating asc, test.name desc
      select test.name"
    `);
    await expect(query).resolves.toEqual(["c", "d", "b", "a"]);
  })

  it("will sort descending", async () => {
    await ready;
    const query = Query(where => {
      const test = where(Test);
      where(test.id).desc();
      return test.name;
    });

    await expect(query).resolves.toEqual(["d", "c", "a", "b"]);
  })
})

describe("join", () => {
  class Table extends connect() {}

  class Foo extends Table {
    static table = "foo";
    name = str();
    color = str();
  }

  class Bar extends Table {
    static table = "bar";
    name = str();
    color = str();
    rating = num();
  }

  class Baz extends Table {
    static table = "baz";
    color = str();
    rating = num();
  }

  const ready = (async () => {
    await seed(Foo,
      { name: "Danny", color: "red" },
      { name: "Gabe", color: "blue" },
      { name: "Bob", color: "green" }
    );
    await seed(Bar,
      { name: "x", color: "red", rating: 60 },
      { name: "y", color: "blue", rating: 70 },
      { name: "z", color: "green", rating: 40 }
    );
    await seed(Baz,
      { color: "blue", rating: 70 }
    );
  })();

  it("will join multiple", async () => {
    await ready;
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

    expect<Query<number>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      join bar on bar.color = foo.color
      join baz on baz.rating = bar.rating
      where foo.name <> "Danny"
      where bar.rating > 50
      where baz.color = "blue"
      select count"
    `);
    await expect(query).resolves.toBe(1);
  })

  it("will select left join", async () => {
    await ready;
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);
      const baz = where(Baz, true);

      where(bar.color).equal(foo.color);
      where(baz.rating).equal(bar.rating);
      where(bar.id).asc();

      return {
        fooValue: foo.name,
        barValue: bar.name,
        bazRating: baz.rating
      };
    });

    type Returns = Query.Selects<{
      fooValue: string;
      barValue: string;
      bazRating: number | undefined;
    }>;

    expect<Returns>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      join bar on bar.color = foo.color
      left join baz on baz.rating = bar.rating
      order bar.id asc
      select
        fooValue: foo.name
        barValue: bar.name
        bazRating: baz.rating"
    `);
    await expect(query).resolves.toEqual([
      { fooValue: "Danny", barValue: "x" },
      { fooValue: "Gabe", barValue: "y", bazRating: 70 },
      { fooValue: "Bob", barValue: "z" }
    ]);
  })

  it("will compare within a table", async () => {
    await ready;
    const query = Query(where => {
      const bar = where(Bar);
      const baz = where(Baz);

      where(baz.color).equal(bar.color);
      where(baz.rating).equal(bar.rating);
      where(bar.name).equal(bar.name);

      return baz.color;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from bar on bar.name = bar.name
      join baz on baz.color = bar.color and baz.rating = bar.rating
      select baz.color"
    `);
    await expect(query).resolves.toEqual(["blue"]);
  })

  it("will join a table with alias", async () => {
    class Other extends Table {
      static schema = "other";
      static table = "baz";
      color = str();
      rating = num();
    }

    await Other.insert({ color: "red", rating: 99 });

    const query = Query(where => {
      const foo = where(Foo);
      const other = where(Other);

      where(other.color).equal(foo.color);

      return other.rating;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      join other.baz T1 on T1.color = foo.color
      select T1.rating"
    `);
    await expect(query).resolves.toEqual([99]);
  })

  it("will throw on mixed connections", () => {
    class Other extends connect() {
      static table = "other";
      color = str();
    }

    const query = () => Query(where => {
      where(Foo);
      where(Other);
    });

    expect(query).toThrow("Joined entity Other does not share a connection with other tables in Query.");
  })
})

describe("relations", () => {
  class Table extends connect() {}

  class C extends Table {
    static table = "c";
    value = num();
    label = str();
  }

  class B extends Table {
    static table = "b";
    c = one(C);
    value = str();
  }

  class A extends Table {
    static table = "a";
    b = one(B);
    value = str();
  }

  class D extends Table {
    static table = "d";
    c = one(C, null);
  }

  const ready = (async () => {
    const [c1, c2] = await seed(C, { value: 100, label: "hundred" }, { value: 200, label: "two" });
    const [b1, b2] = await seed(B, { c: c1, value: "b1" }, { c: c2, value: "b2" });

    await seed(A, { b: b1, value: "a1" }, { b: b2, value: "a2" });
    await seed(D, { c: c1 }, {});
  })();

  it("will join through a relation", async () => {
    await ready;
    const query = Query(where => where(A).b.value);

    expect(String(query)).toMatchInlineSnapshot(`
      "from a
      join b on b.id = a.b_id
      select b.value"
    `);
    await expect(query).resolves.toEqual(["b1", "b2"]);
  })

  it("will join nested relations", async () => {
    await ready;
    const query = Query(where => {
      const a = where(A);

      where(a.b.c.value).equal(100);

      return {
        aValue: a.value,
        cLabel: a.b.c.label
      };
    });

    expect<Query.Selects<{ aValue: string, cLabel: string }>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from a
      join b on b.id = a.b_id
      join c on c.id = b.c_id
      where c.value = 100
      select
        aValue: a.value
        cLabel: c.label"
    `);
    await expect(query).resolves.toEqual([{ aValue: "a1", cLabel: "hundred" }]);
  })

  it("will left join a nullable relation", async () => {
    await ready;
    const query = Query(where => {
      const d = where(D);
      return { id: d.id, label: d.c.label };
    });

    expect<Query.Selects<{ id: string | number, label: string | undefined }>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from d
      left join c on c.id = d.c_id
      select
        id: d.id
        label: c.label"
    `);
    await expect(query).resolves.toEqual([{ id: 1, label: "hundred" }, { id: 2 }]);
  })

  it("will select a relation as nested object", async () => {
    await ready;
    const query = Query(where => {
      const b = where(B);
      where(b.id).equal(1);
      return { b };
    });

    await expect(query).resolves.toEqual([{
      b: { id: 1, value: "b1", c: { id: 1, value: 100, label: "hundred" } }
    }]);
  })

  it("will hydrate relations of entities", async () => {
    await ready;
    const [a] = await Query(where => {
      const a = where(A);
      where(a.id).equal(1);
      return a;
    });

    expect(a.b).toBeInstanceOf(B);
    expect(a.b.c.label).toBe("hundred");
  })
})

describe("insert", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
  }

  class Info extends Table {
    static table = "info";
    user = one(User);
    color = str();
  }

  it("will insert a single row", async () => {
    const query = Query(where => where(User, { name: "John" }).id);

    expect(String(query)).toMatchInlineSnapshot(`
      "insert user
        name: "John"
      select user.id"
    `);
    await expect(query).resolves.toEqual([1]);
  })

  it("will insert into a joined table", async () => {
    await seed(User, { name: "Jane" }, { name: "Joe" });

    const query = Query(where => {
      const user = where(User);
      const info = where(Info, { user: user.id, color: "blue" });

      where(user.name).not("John");

      return info.id;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      where user.name <> "John"
      insert info
        user: user.id
        color: "blue"
      select info.id"
    `);
    await expect(query).resolves.toEqual([1, 2]);
  })

  it("will insert relations", async () => {
    const jane = await User.one({ name: "Jane" });

    const query = Query(where => {
      const user = where(User);

      where(user.name).equal("Joe");
      where(Info, { user, color: "red" });
      where(Info, { user: jane, color: "green" });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      where user.name = "Joe"
      insert info
        user: user.id
        color: "red"
      insert info
        user: 2
        color: "green""
    `);
    await expect(query).resolves.toBe(1);

    const infos = await Info.find({ color: "green" });

    expect(infos.map(x => x.user)).toEqual([jane]);
  })

  it("will return inserted entity", async () => {
    const [user] = await Query(where => where(User, { name: "Ann" }));

    expect(user).toBeInstanceOf(User);
    expect(user.name).toBe("Ann");
    await expect(User.one(user.id)).resolves.toBe(user);
  })

  it("will insert iterable data", async () => {
    const data = [
      { name: "Ron" },
      { name: "Sam" },
      { name: "Tim" }
    ];

    const query = Query(where => {
      where(User, ...data);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "with input (name) [3]
      insert user
        name: input.name"
    `);
    await expect(query).resolves.toBe(3);
    await expect(User.find({ name: "Sam" })).resolves.toHaveLength(1);
  })

  it("will throw for relation by object", () => {
    const query = () => Query(where => {
      where(Info, { user: { name: "Nope" } as any, color: "red" });
    });

    expect(query).toThrow("Relation info.user_id takes an entity, id or table in a query.");
  })

  it("will throw for missing value", () => {
    const query = () => Query(where => {
      // @ts-expect-error
      where(Info, { user: 1 });
    });

    expect(query).toThrow("Can't assign to `info.color`. A value is required but got undefined.");
  })

  it("will add index to specify error", () => {
    const query = () => Query(where => {
      where(User, { name: "foo" }, {} as any);
    });

    expect(query).toThrow("A provided value at `name` at index [1] is not acceptable.\nCan't assign to `user.name`. A value is required but got undefined.");
  })

  it("will throw for unacceptable value", () => {
    class Strict extends Table {
      static table = "strict";
      value = num({
        set(value: unknown){
          if (typeof value != "number")
            throw new Error("Value must be a number.");

          return value;
        }
      });
      other = num({
        optional: true,
        set(){
          throw "Never.";
        }
      });
    }

    const bad = () => Query(where => void where(Strict, { value: "3" } as any));
    const never = () => Query(where => void where(Strict, { value: 3, other: 1 }));

    expect(bad).toThrow("Provided value for strict.value is not acceptable.\nValue must be a number.");
    expect(never).toThrow("Provided value for strict.other is not acceptable.\nNever.");
  })

  it("will allow missing increment and null", async () => {
    class Seq extends Table {
      static table = "seq";
      serial = num({ increment: true });
      note = str(null);
    }

    const query = Query(where => where(Seq, { note: null }));
    const [seq] = await query;

    expect(String(query)).toMatchInlineSnapshot(`
      "insert seq
        note: null
      select seq"
    `);
    expect(seq.note).toBeNull();
    expect(() => Query(where => void where(User, { name: null as any }))).toThrow("Column user.name is not nullable.");
  })
})

describe("update", () => {
  class Table extends connect() {}

  class Foo extends Table {
    static table = "foo";
    value = str();
    color = str();
    note = str(null);
  }

  class Bar extends Table {
    static table = "bar";
    value = str();
    color = str();
  }

  it("will update rows", async () => {
    await seed(Foo, { value: "a", color: "red" }, { value: "b", color: "blue" });

    const query = Query(where => {
      const foo = where(Foo);

      where(foo.color).equal("red");
      where(foo).update({ value: "new!", color: "pink", note: undefined });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      where foo.color = "red"
      update foo
        value: "new!"
        color: "pink""
    `);
    await expect(query).resolves.toBe(1);
    await expect(Foo.connection.select("foo", [])).resolves.toEqual([
      { id: 1, value: "new!", color: "pink" },
      { id: 2, value: "b", color: "blue" }
    ]);
  })

  it("will update with joins", async () => {
    await seed(Bar, { value: "from bar", color: "blue" });

    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(foo).update({ value: bar.value, note: null });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      join bar on bar.color = foo.color
      update foo
        value: bar.value
        note: null"
    `);
    await expect(query).resolves.toBe(1);

    const [foo] = await Foo.connection.select("foo", [["id", "=", 2]]);

    expect(foo).toEqual({ id: 2, value: "from bar", color: "blue", note: null });
  })

  it("will complain about nullable mismatch", () => {
    const query = () => Query(where => {
      const foo = where(Foo);
      // @ts-expect-error
      where(foo).update({ value: null });
    });

    expect(query).toThrow("Column foo.value is not nullable.");
  })

  it("will update from data", async () => {
    class Users extends connect() {
      static table = "users";
      name = str();
      age = num({ type: "integer" });
    }

    await seed(Users, { name: "John", age: 0 }, { name: "Jane", age: 0 }, { name: "Joe", age: 0 });

    const data = [
      { name: "John", age: 30 },
      { name: "Jane", age: 25 }
    ];

    const query = Query(where => {
      const { age, name } = where(data);
      const user = where(Users);

      expect(age.datatype).toBe("");

      where(user.name).equal(name);
      where(user).update({ age });

      expect(age.datatype).toBe("integer");
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "with input (age, name) [2] on users.name = input.name
      from users
      update users
        age: input.age"
    `);
    await expect(query).resolves.toBe(2);
    await expect(Users.connection.select("users", [])).resolves.toEqual([
      { id: 1, name: "John", age: 30 },
      { id: 2, name: "Jane", age: 25 },
      { id: 3, name: "Joe", age: 0 }
    ]);
  })

  it("will throw for unused input", () => {
    const query = () => Query(where => {
      const { name } = where([{ name: "John" }]);
      return { name };
    });

    expect(query).toThrow("Field for input name is not defined.");
  })
})

describe("delete", () => {
  class Table extends connect() {}

  class Foo extends Table {
    static table = "foo";
    value = str();
    color = str();
  }

  class Bar extends Table {
    static table = "bar";
    color = str();
  }

  it("will delete rows", async () => {
    await seed(Foo, { value: "Hello World!", color: "red" }, { value: "other", color: "blue" });
    await seed(Bar, { color: "blue" }, { color: "blue" });

    const query = Query(where => {
      const foo = where(Foo);
      where(foo.value).equal("Hello World!");
      where(foo).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      where foo.value = "Hello World!"
      delete foo"
    `);
    await expect(query).resolves.toBe(1);
    await expect(Foo.connection.select("foo", [])).resolves.toHaveLength(1);
  })

  it("will delete with joins", async () => {
    const query = Query(where => {
      const foo = where(Foo);
      const bar = where(Bar);

      where(bar.color).equal(foo.color);
      where(foo).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      join bar on bar.color = foo.color
      delete foo"
    `);
    await expect(query).resolves.toBe(1);
    await expect(Foo.connection.select("foo", [])).resolves.toEqual([]);
  })
})

describe("computed", () => {
  class Item extends connect() {
    static table = "item";
    number = num();
    other = num(null);
  }

  const ready = seed(Item, { number: 6, other: 3 }, { number: 10 });

  it("will select arithmetic", async () => {
    await ready;
    const query = Query((where, fn) => {
      const { add, sub, mul, div, mod } = fn;
      const { number, other } = where(Item);

      where(number).asc();

      return {
        add: add(number, 2),
        sub: sub(number, other),
        mul: mul(number, 2),
        div: div(number, 2),
        mod: mod(number, 4)
      };
    });

    expect<Query.Selects<{ add: number, sub: number, mul: number, div: number, mod: number }>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      order item.number asc
      select
        add: item.number + 2
        sub: item.number - item.other
        mul: item.number * 2
        div: item.number / 2
        mod: item.number % 4"
    `);
    await expect(query).resolves.toEqual([
      { add: 8, sub: 3, mul: 12, div: 3, mod: 2 },
      { add: 12, sub: null, mul: 20, div: 5, mod: 2 }
    ]);
  })

  it("will properly nest", async () => {
    await ready;
    const query = Query((where, fn) => {
      const { add, mul, neg, pos } = fn;
      const { number, other } = where(Item);

      where(number).asc();

      return {
        a: mul(number, add(number, 5)),
        b: add(mul(number, 5), number),
        c: neg(add(number, 100)),
        d: neg(pos(number)),
        e: neg(other)
      };
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      order item.number asc
      select
        a: item.number * (item.number + 5)
        b: item.number * 5 + item.number
        c: -(item.number + 100)
        d: -(+item.number)
        e: -item.other"
    `);
    await expect(query).resolves.toEqual([
      { a: 66, b: 36, c: -106, d: -6, e: -3 },
      { a: 150, b: 60, c: -110, d: -10, e: null }
    ]);
  })

  it("will select bitwise", async () => {
    await ready;
    const query = Query((where, fn) => {
      const { not, and, or, xor, left, right } = fn.bit;
      const { number } = where(Item);

      where(number).equal(6);

      return {
        not: not(number),
        and: and(number, 3),
        or: or(number, 1),
        xor: xor(number, 3),
        left: left(number, 1),
        right: right(number, 1)
      };
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from item
      where item.number = 6
      select
        not: ~item.number
        and: item.number & 3
        or: item.number | 1
        xor: item.number ^ 3
        left: item.number << 1
        right: item.number >> 1"
    `);
    await expect(query).resolves.toEqual([
      { not: -7, and: 2, or: 7, xor: 5, left: 12, right: 3 }
    ]);
  })

  it("will filter by computed", async () => {
    await ready;
    const query = Query((where, fn) => {
      const item = where(Item);
      where(item.number).over(fn.mul(item.other, 2));
      return item.number;
    });

    await expect(query).resolves.toEqual([]);
  })
})

describe("template", () => {
  class Foo extends connect() {
    static table = "foo";
    first = str();
    last = str();
    color = str();
  }

  const ready = seed(Foo,
    { first: "John", last: "Doe", color: "red" },
    { first: "Jane", last: "Smith", color: "blue" }
  );

  it("will create a template", async () => {
    await ready;
    const query = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).equal(color);
      return foo.first;
    });

    expect<Query.TemplateSelects<string, [string]>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      where foo.color = $0
      select foo.first"
    `);
    await expect(query("red")).resolves.toEqual(["John"]);
    await expect(query("blue")).resolves.toEqual(["Jane"]);
  })

  it("will preserve params order", async () => {
    await ready;
    const query = Query(where => (color: string, first: string) => {
      const foo = where(Foo);

      where(foo.first).equal(first);
      where(foo.color).equal(color);

      return foo.last;
    });

    const getJohn = query("red", "John");

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      where foo.first = $1
      where foo.color = $0
      select foo.last"
    `);
    expect(getJohn.params).toEqual(["John", "red"]);
    await expect(getJohn).resolves.toEqual(["Doe"]);
  })

  it("will preprocess params", async () => {
    class Thing extends connect() {
      static table = "thing";
      active = bool();
    }

    await seed(Thing, { active: true }, { active: false });

    const query = Query(where => (active: boolean) => {
      const thing = where(Thing);
      where(thing.active).equal(active);
      return thing.id;
    });

    const active = query(true);

    expect(active.params).toEqual([1]);
    await expect(active).resolves.toEqual([1]);
  })

  it("will select a parameter value", async () => {
    await ready;
    const query = Query(where => (color: string) => {
      where(Foo);
      return { color };
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select
        color: $0"
    `);
    await expect(query("red")).resolves.toEqual([{ color: "red" }, { color: "red" }]);
  })

  it("will select a parameter directly", async () => {
    await ready;
    const query = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.first).equal("John");
      return color;
    });

    expect<Query.TemplateSelects<string, [string]>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      where foo.first = "John"
      select $0"
    `);
    await expect(query("red")).resolves.toEqual(["red"]);
  })

  it("will run a template without returns", async () => {
    await ready;
    const query = Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).equal(color);
    });

    expect<Query.Template<[string]>>(query);
    await expect(query("red")).resolves.toBe(1);
  })

  it("will throw if parameter is reused", () => {
    const query = () => Query(where => (color: string) => {
      const foo = where(Foo);
      where(foo.color).equal(color);
      where(foo.first).equal(color);
    });

    expect(query).toThrow("Parameter 0 is already defined.");
  })

  it("will send data as a parameter", async () => {
    await ready;
    const query = Query(where => (color: string) => {
      const input = where([{ first: "John" }, { first: "Jane" }]);
      const foo = where(Foo);

      where(foo.first).equal(input.first);
      where(foo.color).equal(color);

      return foo.last;
    });

    const smith = query("blue");

    expect(smith.params).toEqual([[["John"], ["Jane"]], "blue"]);
    await expect(smith).resolves.toEqual(["Smith"]);
  })

  it("will embed raw expressions", async () => {
    await ready;
    const query = Query((where, fn) => {
      const { first } = where(Foo);

      return {
        a: fn(`upper(${first})`),
        b: where(`lower(${first})`)
      };
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select
        a: \`upper(foo.first)\`
        b: \`lower(foo.first)\`"
    `);
    await expect(query).rejects.toThrow("Query templates are not supported by the memory driver.");
  })
})

describe("connection", () => {
  it("will throw if connection cannot prepare", async () => {
    class Foo extends Type {
      static table = "foo";
      name = str();
    }

    const query = Query(where => where(Foo).name);

    expect(String(query)).toMatchInlineSnapshot(`
      "from foo
      select foo.name"
    `);
    await expect(query).rejects.toThrow("Query needs a connection with prepare() to run.");
  })

  it("will expose connection", async () => {
    class Foo extends connect() {
      static table = "foo";
      name = str();
    }

    const db = memory();

    await db.insert("foo", { name: "Gabe" });

    const query = Query(where => {
      const foo = where(Foo);

      expect(where.connection).toBe(Foo.connection);
      where.connection = db;

      return foo.name;
    });

    await expect(query).resolves.toEqual(["Gabe"]);
  })

  it("will query structural tables", async () => {
    const db = memory();

    class Plain {
      static table = "plain";
      static connection = db;
      static fields = new Map([
        ["id", new Field("id")],
        ["fullName", new Field("fullName")]
      ]);

      declare id: number;
      declare fullName: string;
    }

    await db.insert("plain", { full_name: "Gabe" });

    const query = Query(where => where(Plain));

    expect(String(query)).toMatchInlineSnapshot(`
      "from plain
      select plain"
    `);
    await expect(query).resolves.toEqual([{ id: 1, fullName: "Gabe" }]);
  })
})

describe("types", () => {
  class Table extends connect() {}

  class User extends Table {
    static table = "user";
    name = str();
    age = num(null);
    active = bool();
  }

  class Post extends Table {
    static table = "post";
    title = str();
    user = one(User);
    editor = one(User, null);
  }

  it("will infer returns through relations", () => {
    const query = Query(where => {
      const post = where(Post);

      return {
        title: post.title,
        author: post.user.name,
        age: post.user.age,
        active: post.user.active,
        editor: post.editor.name
      };
    });

    type Returns = Query.Selects<{
      title: string;
      author: string;
      age: number | undefined;
      active: boolean;
      editor: string | undefined;
    }>;

    expect<Returns>(query);
    // @ts-expect-error
    expect<Query.Selects<{ title: number }>>(query);
  })

  it("will select entities by class", () => {
    const query = Query(where => where(Post));

    expect<Query.Selects<Post>>(query);
    // @ts-expect-error
    expect<Query.Selects<User>>(query);
  })

  it("will check comparisons and writes", () => {
    const query = () => Query(where => {
      const post = where(Post);

      where(post.user.age).equal(null);
      where(post.user.age).over(post.user.age);
      where(Post, { title: "x", user: 1 });
      where(Post, { title: "x", user: where(User) });
      where(post).update({ editor: null });

      // @ts-expect-error
      where(post.title).equal(3);
      // @ts-expect-error
      where(post.title).equal(null);
      // @ts-expect-error
      where(post.title).equal(post.user.age);
      // @ts-expect-error
      where(Post, { title: 3, user: 1 });
      // @ts-expect-error
      where(post).update({ title: null });
    });

    expect(query).toThrow("Column post.title is not nullable.");
  })
})
