import { describe, expect, it } from 'vitest';

import { str } from './fields';
import { get } from './get';
import { memory } from './memory';
import { one } from './one';
import { Type } from './Type';

describe("get", () => {
  class Table extends Type {
    static connection = memory();
  }

  class Profile extends Table {
    static table = "profile";
    user = one(User);
    bio = str();
  }

  class User extends Table {
    static table = "user";
    name = str();
    profiles = get(Profile);
  }

  const ready = (async () => {
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("user", { name: "Alice" });
    await Table.connection.insert("profile", { user_id: 1, bio: "Dev" });
    await Table.connection.insert("profile", { user_id: 2, bio: "Designer" });
  })();

  it("will infer one-to-many relationships", async () => {
    await ready;
    const gabe = await User.one(1);
    const gabeProfiles = await gabe.profiles.find();

    expect(gabeProfiles).toHaveLength(1);
    expect(gabeProfiles[0].bio).toBe("Dev");
    expect(gabe.profiles.name).toBe("Profile");
  });

  it("will reuse child type", async () => {
    await ready;
    const gabe = await User.one(1);

    expect(gabe.profiles).toBe(gabe.profiles);
  });

  it("will insert into child type", async () => {
    await ready;
    const alice = await User.one(2);
    const profile = await alice.profiles.insert({ bio: "Manager" } as any);

    expect(profile.user).toBe(alice);
  });

  it("will throw if parent is unsaved", () => {
    const bob = User.new({ name: "Bob" });

    expect(() => bob.profiles).toThrow("Parent entity undefined does not exist");
  });
});

describe("errors", () => {
  class Table extends Type {
    static connection = memory();
  }

  it("will throw if no relationship found", async () => {
    class User extends Table {
      static table = "user"
      articles = get(Article)
    }

    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.insert({});

    expect(() => gabe.articles).toThrow("Did you forget to use one(Article) in this model?");
  });

  it("will throw if bad property given", async () => {
    class User extends Table {
      static table = "user"
      // @ts-expect-error
      articles = get(Article, "foobar")
    }

    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.insert({});

    expect(() => gabe.articles).toThrow("Field foobar does not exist on Article");
  });
});
