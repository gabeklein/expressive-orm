import { State } from '@expressive/mvc';
import { describe, expect, it } from 'vitest';

import { str } from './fields';
import { memory } from './memory';
import { one } from './one';
import { rows } from './rows';
import { Type } from './Type';

describe("rows", () => {
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
    profiles = rows(Profile);
  }

  const ready = (async () => {
    await Table.connection.insert("user", { name: "Gabe" });
    await Table.connection.insert("user", { name: "Alice" });
    await Table.connection.insert("profile", { user_id: 1, bio: "Dev" });
    await Table.connection.insert("profile", { user_id: 2, bio: "Designer" });
    await Table.connection.insert("profile", { user_id: 1, bio: "Writer" });
  })();

  it("will find related rows", async () => {
    await ready;
    const gabe = await User.one(1);
    const profiles = await gabe.profiles.find();

    expect(profiles.map(p => p.bio)).toEqual(["Writer", "Dev"]);
  });

  it("will apply foreign key over query", async () => {
    await ready;
    const gabe = await User.one(1);
    const found = await gabe.profiles.find({ bio: "Designer", user: 2 });

    expect(found).toEqual([]);
  });

  it("will page related rows", async () => {
    await ready;
    const gabe = await User.one(1);
    const page = await gabe.profiles.find({}, 1, 1);

    expect(page.map(p => p.bio)).toEqual(["Writer"]);
  });

  it("will get one related row", async () => {
    await ready;
    const alice = await User.one(2);

    expect((await alice.profiles.one()).bio).toBe("Designer");
    expect((await alice.profiles.one({ bio: "Designer" })).bio).toBe("Designer");
    await expect(alice.profiles.one({ bio: "Dev" }, false)).resolves.toBeUndefined();
    await expect(alice.profiles.one({ bio: "Dev" })).rejects.toThrow("No Profile found");
  });

  it("will insert with foreign key", async () => {
    await ready;
    const alice = await User.one(2);
    const profile = await alice.profiles.insert({ bio: "Manager" });

    expect(profile.user).toBe(alice);
  });

  it("will reuse handle", async () => {
    await ready;
    const gabe = await User.one(1);

    expect(gabe.profiles).toBe(gabe.profiles);
  });

  it("will not be a State", async () => {
    await ready;
    const gabe = await User.one(1);

    expect(gabe.profiles).not.toBeInstanceOf(State);
    expect(Object.keys(gabe)).not.toContain("profiles");
    expect(() => { (gabe as any).profiles = null }).toThrow("read-only");
  });

  it("will throw if parent is unsaved", () => {
    const bob = User.new({ name: "Bob" });

    expect(() => bob.profiles).toThrow("Parent entity undefined does not exist");
  });
});

describe("explicit field", () => {
  class Table extends Type {
    static connection = memory();
  }

  class User extends Table {
    static table = "user";
    name = str();
    authored = rows(Post, "author");
    edited = rows(Post, "editor");
  }

  class Post extends Table {
    static table = "post";
    author = one(User, { column: "author_id" });
    editor = one(User, { column: "editor_id" });
  }

  it("will use given field", async () => {
    const gabe = await User.insert({ name: "Gabe" });
    const alice = await User.insert({ name: "Alice" });

    await gabe.authored.insert({ editor: alice });

    const [authored] = await gabe.authored.find();
    const [edited] = await alice.edited.find();

    expect(authored).toBe(edited);
    expect(authored.author).toBe(gabe);
    expect(authored.editor).toBe(alice);
    expect(await alice.authored.find()).toEqual([]);
  });
});

describe("errors", () => {
  class Table extends Type {
    static connection = memory();
  }

  it("will throw if no relationship found", async () => {
    class User extends Table {
      static table = "user"
      articles = rows(Article)
    }

    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.insert({});

    expect(() => gabe.articles).toThrow("Did you forget to use one(Article) in this model?");
  });

  it("will throw if relationship is ambiguous", async () => {
    class User extends Table {
      static table = "user";
      posts = rows(Post);
    }

    class Post extends Table {
      static table = "post";
      author = one(User);
      editor = one(User);
    }

    const user = await User.insert({});

    expect(() => user.posts).toThrow("There are multiple relationships, you will need to specify which one to use.");
  });

  it("will throw if bad property given", async () => {
    class User extends Table {
      static table = "user"
      // @ts-expect-error
      articles = rows(Article, "foobar")
    }

    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.insert({});

    expect(() => gabe.articles).toThrow("Field foobar does not exist on Article");
  });
});
