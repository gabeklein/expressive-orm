import { Table, str, asc, greaterThan, one } from "./Table";

it("will allow for methods", async () => {
  await Table.connection.init(`
    CREATE TABLE IF NOT EXISTS "user" (
      id SERIAL PRIMARY KEY,
      name TEXT
    );  
  `);

  const didGreet = vi.fn();

  class User extends Table {
    static table = "user";

    name = str();

    greet() {
      didGreet(`Hello, ${this.name}`);
    }
  }

  const user = await User.new({ name: "John" });

  expect(user.id).toBe(1);
  expect(user.name).toBe("John");

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John");

  await user.update({ name: "John Doe" });

  user.greet();

  expect(didGreet).toHaveBeenCalledWith("Hello, John Doe");
})

describe("one method", () => {
  class User extends Table {
    static table = "users";

    name = str();
  }

  beforeAll(() => {
    Table.connection.init(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT
      );

      INSERT INTO users (name)
      VALUES ('Gabe'), ('Alice'), ('Bob');
    `);
  });

  it("will get record by id", async () => {
    const user = await User.one(2);

    expect(user.id).toBe(2);
  });

  it("will get latest record", async () => {
    const user = await User.one();

    expect(user.id).toBe(3);
  });

  it("will get ascending result", async () => {
    const user = await User.one({ id: asc() });

    expect(user.id).toBe(1);
  });

  it("will both match and sort", async () => {
    const user = await User.one({
      id: [asc(), greaterThan(1)],
    });

    expect(user.id).toBe(2);
  });

  it("will search for match", async () => {
    const user = await User.one({ name: "Gabe" });

    expect(user.id).toBe(1);
  });

  it("will throw on no match", async () => {
    const query = User.one({ name: "Foo" });

    await expect(query).rejects.toThrow();
  });

  it("will return undefined if optional", async () => {
    const user = await User.one({ name: "Foo" }, false);

    expect(user).toBeUndefined();
  });
});

describe("extended types", () => {
  class User extends Table {
    static table = "users";

    name = str();
  }

  class UserExt extends User {
    static from(name: string) {
      return this.new({ name });
    }

    displayName() {
      return `User: ${this.name}`;
    }
  }

  beforeAll(() => {
    Table.connection.init(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT
      );

      INSERT INTO users (name)
      VALUES ('Gabe'), ('Alice');
    `);
  });

  it("will create extended type", async () => {
    const user = await UserExt.from("Charlie");

    expect(user).toBeInstanceOf(UserExt);
    expect(user.displayName()).toBe("User: Charlie");
  });

  it("will update using extended type", async () => {
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
  class Bar extends Table {}
  class FooBar extends Table {
    a = str();
    b = str(null);
    c = str({ nullable: true });
    d = str({ column: "foobar", nullable: true });

    e = one(Bar);
    f = one(Bar, null);
    g = one(Bar, { nullable: true });
    h = one(Bar, { column: "bar_id", nullable: true });
  }

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