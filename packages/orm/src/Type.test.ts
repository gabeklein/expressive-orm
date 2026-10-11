import { describe, expect, it, vi } from 'vitest';
import { State } from '@expressive/mvc';

import { Field } from './Field';
import { memory } from './memory';
import { Query } from './query/Query';
import { Type } from './Type';
import { asc, desc, equal, greaterThan, isIn, Where } from './where';
import { bool, date, json, num, one, optional, orNull, str } from '.';

function connect(){
  return class Table extends Type {
    static connection = memory();
  }
}

it("will be a State", async () => {
  class User extends connect() {
    name = str();
  }

  const user = await User.insert({ name: "John" });

  expect(user).toBeInstanceOf(State);
  expect(user.get()).toEqual({ id: 1, name: "John" });

  const didUpdate = vi.fn();

  user.set(didUpdate);
  user.name = "Jane";

  expect(user.name).toBe("Jane");
  expect(didUpdate).toHaveBeenCalledWith("name", user);
});

it("will construct unsaved entity", () => {
  class User extends connect() {
    name = str();
  }

  const user = User.new({ name: "John" });

  expect(user.id).toBeUndefined();
  expect(user.name).toBe("John");
});

it("will allow for methods", async () => {
  const didGreet = vi.fn();

  class User extends connect() {
    name = str();

    greet() {
      didGreet(`Hello, ${this.name}`);
    }
  }

  const user = await User.insert({ name: "John" });

  expect(user.id).toBe(1);
  expect(user.name).toBe("John");

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John");

  await user.update({ name: "John Doe" });

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John Doe");
})

it("will throw if no connection", async () => {
  class User extends Type {
    name = str();
  }

  await expect(User.find()).rejects.toThrow("No database connection.");
})

describe("fields", () => {
  it("will collect fields without an instance", () => {
    class User extends connect() {
      name = str();
      fullName = str({ column: "full" });
    }

    const { fields } = User;

    expect([...fields.keys()]).toEqual(["id", "name", "fullName"]);
    expect(fields.get("name")).toBeInstanceOf(Field);
    expect(fields.get("fullName")!.column).toBe("full");
    expect(User.fields).toBe(fields);
  })

  it("will use fields of first instance", () => {
    class User extends connect() {
      name = str();
    }

    User.new();

    expect([...User.fields.keys()]).toEqual(["id", "name"]);
  })

  it("will apply nullable and optional", () => {
    class User extends connect() {
      a = str(orNull);
      b = str(optional);
      c = str(null, undefined, false);
    }

    const { a, b, c } = Object.fromEntries(User.fields);

    expect(a.nullable).toBe(true);
    expect(b.optional).toBe(true);
    expect(c.nullable).toBe(true);
  })

  it("will carry column metadata", () => {
    class User extends connect() {
      name = str({ type: "varchar", length: 3, unique: true });
    }

    class Post extends connect() {
      user = one(User);
    }

    const name = User.fields.get("name")!;

    expect(name.property).toBe("name");
    expect(name.datatype).toBe("varchar");
    expect(name.length).toBe(3);
    expect(name.unique).toBe(true);
    expect(name.kind).toBe(String);
    expect(name.parent).toBe(User);
    expect(Post.fields.get("user")!.reference).toBe(User.fields.get("id"));
  })

  it("will output values", async () => {
    class User extends connect() {
      name = str();
      age = num(orNull);
    }

    const user = await User.insert({ name: "John" });

    expect(user.values).toEqual({ id: 1, name: "John", age: undefined });
    expect(Object.isFrozen(user.values)).toBe(true);
  })
})

describe("codecs", () => {
  class Thing extends connect() {
    flag = bool();
    when = date(orNull);
    data = json<{ a: number }>(orNull);
    count = num(orNull);
  }

  it("will round-trip values", async () => {
    const when = new Date("2024-01-01T00:00:00.000Z");
    const thing = await Thing.insert({ flag: true, when, data: { a: 1 }, count: 3 });

    expect(thing.flag).toBe(true);
    expect(thing.when).toEqual(when);
    expect(thing.data).toEqual({ a: 1 });
    expect(thing.count).toBe(3);
  })

  it("will round-trip empty values", async () => {
    const thing = await Thing.insert({ flag: false, when: undefined, data: undefined, count: undefined });

    expect(thing.flag).toBe(false);
    expect(thing.when).toBeUndefined();
    expect(thing.data).toBeUndefined();
    expect(thing.count).toBeUndefined();
  })

  it("will store null for falsy date", async () => {
    const thing = await Thing.insert({ flag: true, when: null as any });

    expect(thing.when).toBeUndefined();
  })

  it("will parse missing boolean as undefined", async () => {
    await Thing.connection.insert(Thing.ref, { data: null });

    const thing = await Thing.one();

    expect(thing.flag).toBeUndefined();
  })
})

describe("insert", () => {
  it("will throw on missing required field", async () => {
    class User extends connect() {
      name = str();
    }

    // @ts-expect-error
    await expect(User.insert({})).rejects.toThrow("Missing required field: name");
  })

  it("will apply subset", async () => {
    class User extends connect() {
      static subset = { role: "admin" };
      name = str();
      role = str();
    }

    const user = await User.insert({ name: "John" } as any);

    expect(user.role).toBe("admin");
  })

  it("will use schema in ref", async () => {
    class User extends connect() {
      static schema = "app";
      static table = "user";
      name = str();
    }

    await User.insert({ name: "John" });

    expect(User.ref).toBe("app.user");
    await expect(User.connection.get("app.user", [])).resolves.toEqual([{ id: 1, name: "John" }]);
  })

  it("will not inherit a parent's ref", () => {
    class Person extends connect() {
      static table = "person";
    }

    expect(Person.ref).toBe("person");

    class Author extends Person {
      static table = "author";
    }

    expect(Author.ref).toBe("author");
  })
})

describe("update", () => {
  class User extends connect() {
    name = str();
    age = num(orNull);
  }

  it("will update record", async () => {
    const user = await User.insert({ name: "John" });

    await user.update({ age: 30 });

    expect(user.age).toBe(30);
    expect(user.name).toBe("John");

    const [row] = await User.connection.get(User.ref, [["id", "=", user.id]]);

    expect(row).toEqual({ id: user.id, name: "John", age: 30 });
  })

  it("will not update if empty", async () => {
    const update = vi.spyOn(User.connection, "update");
    const user = await User.insert({ name: "John" });

    await user.update({});

    expect(update).not.toHaveBeenCalled();
  })

  it("will write once", async () => {
    const update = vi.spyOn(User.connection, "update");
    const user = await User.insert({ name: "John" });

    user.age = 20;
    await user.update({ name: "Bob" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(User.ref, user.id, { name: "Bob", age: 20 });

    update.mockRestore();
  })

  it("will update by id", async () => {
    const user = await User.insert({ name: "John" });

    await User.update(user.id, { name: "Bob" });

    const fresh = await User.one(user.id, true);

    expect(fresh).toBe(user);
    expect(user.name).toBe("Bob");
  })
})

describe("save", () => {
  class User extends connect() {
    name = str();
    age = num(orNull);
  }

  it("will insert unsaved entity", async () => {
    const user = User.new({ name: "John" });
    const saved = await user.save();

    expect(saved).toBe(user);
    expect(user.id).toBeDefined();
    expect(User.loaded.get(user.id)).toBe(user);
    await expect(User.one(user.id)).resolves.toBe(user);
  })

  it("will assign defaults from inserted row", async () => {
    const db = memory();

    class Post extends Type {
      static connection = {
        ...db,
        insert: (table: string, row: Record<string, any>) => db.insert(table, { status: "draft", ...row }, true)
      };

      status = str(optional);
    }

    const post = Post.new();
    const didUpdate = vi.fn();

    post.set(didUpdate);
    await post.save();

    expect(post.id).toBe(1);
    expect(post.status).toBe("draft");
    expect(didUpdate).toHaveBeenCalledWith("id", post);
    expect(didUpdate).toHaveBeenCalledWith("status", post);
  })

  it("will throw on missing required field", async () => {
    const user = User.new();

    await expect(user.save()).rejects.toThrow("Missing required field: name");
  })

  it("will write only dirty columns", async () => {
    const user = await User.insert({ name: "John" });
    const update = vi.spyOn(User.connection, "update");

    user.age = 30;
    await user.save();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(User.ref, user.id, { age: 30 });

    update.mockRestore();
  })

  it("will not save if nothing is dirty", async () => {
    const user = await User.insert({ name: "John" });
    const update = vi.spyOn(User.connection, "update");

    await expect(user.save()).resolves.toBe(user);

    user.age = 30;
    await user.save();
    await user.save();

    expect(update).toHaveBeenCalledTimes(1);

    update.mockRestore();
  })

  it("will not save value restored to persisted", async () => {
    const user = await User.insert({ name: "John" });
    const update = vi.spyOn(User.connection, "update");

    user.name = "Bob";
    user.name = "John";
    await user.save();

    expect(update).not.toHaveBeenCalled();

    update.mockRestore();
  })

  it("will clear nullable column", async () => {
    const user = await User.insert({ name: "John", age: 30 });

    user.age = undefined;
    await user.save();

    const [row] = await User.connection.get(User.ref, [["id", "=", user.id]]);

    expect(row.age).toBeNull();
    expect(user.age).toBeNull();
  })

  it("will be clean after hydration", async () => {
    const user = await User.insert({ name: "John" });
    const update = vi.spyOn(User.connection, "update");

    user.name = "Bob";
    await User.one(user.id, true);
    await user.save();

    expect(user.name).toBe("John");
    expect(update).not.toHaveBeenCalled();

    update.mockRestore();
  })

  it("will update entity constructed with id", async () => {
    const { id } = await User.insert({ name: "John" });
    const user = User.new({ id, name: "Bob" });

    await user.save();

    const [row] = await User.connection.get(User.ref, [["id", "=", id]]);

    expect(row.name).toBe("Bob");
  })

  it("will notify observers on read-back", async () => {
    class Event extends connect() {
      when = date();
    }

    const event = await Event.insert({ when: new Date(0) });
    const assigned = new Date(1);
    const didUpdate = vi.fn();

    event.when = assigned;
    event.set(didUpdate);
    await event.save();

    expect(didUpdate).toHaveBeenCalledWith("when", event);
    expect(event.when).not.toBe(assigned);
    expect(event.when).toEqual(assigned);
  })

  it("will dirty foreign key on relation change", async () => {
    class Table extends connect() {}

    class Author extends Table {
      static table = "author";
      name = str();
    }

    class Book extends Table {
      static table = "book";
      name = str();
      author = one(Author);
    }

    const gabe = await Author.insert({ name: "Gabe" });
    const alice = await Author.insert({ name: "Alice" });
    const book = await Book.insert({ name: "Book", author: gabe });
    const update = vi.spyOn(Book.connection, "update");

    book.author = gabe;
    await book.save();

    expect(update).not.toHaveBeenCalled();

    book.author = alice;
    await book.save();

    expect(update).toHaveBeenCalledWith("book", book.id, { author_id: alice.id });
    expect(book.author).toBe(alice);

    update.mockRestore();
  })
})

describe("delete", () => {
  it("will delete record", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "John" });

    await user.delete();

    await expect(User.find()).resolves.toEqual([]);
  })

  it("will evict and destroy entity", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "John" });
    const destroyed = vi.fn();

    user.set(null, destroyed);
    await user.delete();

    expect(destroyed).toHaveBeenCalled();
    expect(User.loaded.has(user.id)).toBe(false);
  })

  it("will throw on write after delete", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "John" });

    await user.delete();

    await expect(user.save()).rejects.toThrow(`User ${user.id} was deleted.`);
    await expect(user.update({ name: "Bob" })).rejects.toThrow(`User ${user.id} was deleted.`);
    await expect(user.delete()).rejects.toThrow(`User ${user.id} was deleted.`);
    expect(user.name).toBe("John");
  })

  it("will call onDelete", async () => {
    const didDelete = vi.fn();

    class User extends connect() {
      name = str();

      protected async onDelete() {
        didDelete(this.name);
      }
    }

    const user = await User.insert({ name: "John" });

    await user.delete();

    expect(didDelete).toHaveBeenCalledWith("John");
  })
})

describe("one method", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["Gabe", "Alice", "Bob"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will get record by id", async () => {
    await ready;
    const user = await User.one(2);

    expect(user.id).toBe(2);
  });

  it("will get latest record", async () => {
    await ready;
    const user = await User.one();

    expect(user.id).toBe(3);
  });

  it("will get ascending result", async () => {
    await ready;
    const user = await User.one({ id: asc() });

    expect(user.id).toBe(1);
  });

  it("will both match and sort", async () => {
    await ready;
    const user = await User.one({
      id: [asc(), greaterThan(1)],
    });

    expect(user.id).toBe(2);
  });

  it("will search for match", async () => {
    await ready;
    const user = await User.one({ name: "Gabe" });

    expect(user.id).toBe(1);
  });

  it("will throw on no match", async () => {
    await ready;
    const query = User.one({ name: "Foo" });

    await expect(query).rejects.toThrow();
  });

  it("will return undefined if optional", async () => {
    await ready;
    const user = await User.one({ name: "Foo" }, false);

    expect(user).toBeUndefined();
  });
});

describe("find", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["Gabe", "Alice", "Bob"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will find latest first by default", async () => {
    await ready;
    const users = await User.find();

    expect(users.map(x => x.name)).toEqual(["Bob", "Alice", "Gabe"]);
  })

  it("will limit and offset", async () => {
    await ready;
    const users = await User.find({ id: asc() }, 1, 1);

    expect(users.map(x => x.name)).toEqual(["Alice"]);
  })

  it("will match many values", async () => {
    await ready;
    const users = await User.find({ name: isIn(["Gabe", "Bob"]), id: asc() });

    expect(users.map(x => x.id)).toEqual([1, 3]);
  })

  it("will skip undefined conditions", async () => {
    await ready;
    const users = await User.find({ name: [undefined as any, equal(undefined)], id: desc() });

    expect(users).toHaveLength(3);
  })

  it("will default to equality", async () => {
    await ready;
    const users = await User.find({ name: new Where() as any });

    expect(users).toHaveLength(0);
  })

  it("will ignore unknown fields", async () => {
    await ready;
    const users = await User.find({ foo: "bar" } as any);

    expect(users).toHaveLength(3);
  })

  it("will accept constraints", async () => {
    await ready;
    const users = await User["fetch"]([["name", "=", "Alice"], ["foo", "=", 1]]);

    expect(users.map(x => x.id)).toEqual([2]);
  })
})

describe("query", () => {
  class User extends connect() {
    static table = "user";
    name = str();
    age = num();
  }

  const ready = (async () => {
    for (const [name, age] of [["Gabe", 30], ["Alice", 25], ["Bob", 40]] as const)
      await User.insert({ name, age });
  })();

  it("will select entities", async () => {
    await ready;
    const query = User.query();
    const users = await query;

    expect<Query.Selects<Query.From<User>>>(query);
    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      select user"
    `);
    expect(users.map(x => x.name)).toEqual(["Gabe", "Alice", "Bob"]);
    await expect(User.one(1)).resolves.toBe(users[0]);
  })

  it("will filter entities", async () => {
    await ready;
    const query = User.query((user, where) => {
      where(user.age).over(28);
      where(user.name).asc();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "from user
      where user.age > 28
      order user.name asc
      select user"
    `);
    expect((await query).map(x => x.name)).toEqual(["Bob", "Gabe"]);
  })

  it("will select a projection", async () => {
    await ready;
    const query = User.query((user, where) => {
      where(user.age).under(30);
      return { name: user.name };
    });

    expect<Query.Selects<{ name: string }>>(query);
    await expect(query).resolves.toEqual([{ name: "Alice" }]);
  })

  it("will throw without prepare", async () => {
    class Other extends Type {
      static table = "other";
    }

    await expect(Other.query()).rejects.toThrow("Query needs a connection with prepare() to run.");
  })
})

describe("all", () => {
  class User extends connect() {
    name = str();
  }

  const ready = (async () => {
    for (const name of ["A", "B", "C", "D", "E"])
      await User.connection.insert(User.ref, { name });
  })();

  it("will page through results", async () => {
    await ready;
    const pages: string[][] = [];

    for await (const page of User.all(2, { id: asc() }))
      pages.push(page.map(x => x.name));

    expect(pages).toEqual([["A", "B"], ["C", "D"], ["E"]]);
  })

  it("will stop on empty page", async () => {
    await ready;
    const pages: number[] = [];

    for await (const page of User.all(5))
      pages.push(page.length);

    expect(pages).toEqual([5]);
  })

  it("will fetch everything without page size", async () => {
    await ready;
    const pages: number[] = [];

    for await (const page of User.all(0))
      pages.push(page.length);

    expect(pages).toEqual([5]);
  })
})

describe("extended types", () => {
  class User extends connect() {
    static table = "users";

    name = str();
  }

  class UserExt extends User {
    static from(name: string) {
      return this.insert({ name });
    }

    displayName() {
      return `User: ${this.name}`;
    }
  }

  it("will create extended type", async () => {
    const user = await UserExt.from("Charlie");

    expect(user).toBeInstanceOf(UserExt);
    expect(user.displayName()).toBe("User: Charlie");
  });

  it("will update using extended type", async () => {
    await User.insert({ name: "Alice" });

    const user = await UserExt.one(2);

    expect(user).toBeInstanceOf(UserExt);
    expect(user.displayName()).toBe("User: Alice");

    await user.update({ name: "Alice Doe" });

    expect(user.displayName()).toBe("User: Alice Doe");

    const fresh = await UserExt.one(2);

    expect(fresh.displayName()).toBe("User: Alice Doe");
  });
})

describe("types", () => {
  class Bar extends Type {}
  class FooBar extends Type {
    a = str();
    b = str(null);
    c = str({ nullable: true });
    d = str({ column: "foobar", nullable: true });

    e = one(Bar);
    f = one(Bar, null);
    g = one(Bar, { nullable: true });
    h = one(Bar, { column: "bar_id", nullable: true });
  }

  it("will be assignable to Type", () => {
    class User extends Type {
      name = str();

      greet(){}
    }

    const user: Type = User.new();

    expect(user).toBeInstanceOf(Type);
  })

  it("will properly apply nullable", () => {
    const foobar = {} as FooBar;

    foobar.b = undefined;
    foobar.c = undefined;
    foobar.d = undefined;
    foobar.f = undefined;
    foobar.g = undefined;
    foobar.h = undefined;

    // @ts-expect-error
    foobar.a = undefined;
    // @ts-expect-error
    foobar.e = undefined;
  })
})

describe("identity map", () => {
  it("will return the same instance for repeated one(id)", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "A" });
    const fetched1 = await User.one(user.id);
    const fetched2 = await User.one(user.id);

    expect(fetched1).toBe(user);
    expect(fetched2).toBe(user);
  });

  it("will cache parsed entities", async () => {
    class User extends connect() {
      name = str();
    }

    const parsed = await (User as any).parse({ id: 1, name: "B" });

    expect(User.loaded.get(1)).toBe(parsed);
  });

  it("will reload entity when one(id, true)", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "C" });

    await User.connection.update(User.ref, user.id, { name: "C2" });

    const reloaded = await User.one(user.id, true);

    expect(reloaded).toBe(user);
    expect(user.name).toBe("C2");
  });

  it("will keep entities per connection", async () => {
    class User extends connect() {
      name = str();
    }

    const user = await User.insert({ name: "D" });

    User.connection = memory();

    expect(User.loaded.get(user.id)).toBeUndefined();
  });
});
