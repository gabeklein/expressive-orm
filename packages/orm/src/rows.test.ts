import { Model, set } from '@expressive/mvc';
import { describe, expect, it, vi } from 'vitest';

import { str } from './fields';
import { Memory } from './memory';
import { one } from './one';
import { rows } from './rows';
import { Type } from './Type';

describe("rows", () => {
  class Table extends Type {
    static connection = Memory.new();
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

  it("will query related rows", async () => {
    await ready;
    const gabe = await User.get(1);
    const profiles = await gabe.profiles.query();

    expect(profiles.map(p => p.bio)).toEqual(["Writer", "Dev"]);
  });

  it("will apply foreign key over query", async () => {
    await ready;
    const gabe = await User.get(1);
    const found = await gabe.profiles.query({ bio: "Designer", user: 2 });

    expect(found).toEqual([]);
  });

  it("will page related rows", async () => {
    await ready;
    const gabe = await User.get(1);
    const page = await gabe.profiles.query({}, 1, 1);
    const batches = [];

    for await (const batch of gabe.profiles.query(undefined, 1))
      batches.push(batch.map(p => p.bio));

    expect(page.map(p => p.bio)).toEqual(["Dev"]);
    expect(batches).toEqual([["Writer"], ["Dev"]]);
  });

  it("will load related entities", async () => {
    await ready;
    const gabe = await User.get(1);
    const profiles = await gabe.profiles.load();
    const [writer] = await gabe.profiles.load({ bio: "Writer", user: 2 });

    expect(profiles.map(p => p.bio)).toEqual(["Writer", "Dev"]);
    expect(profiles[0]).toBeInstanceOf(Profile);
    expect(writer).toBe(profiles[0]);
    expect(await gabe.profiles.load(undefined, 1, 1)).toEqual([profiles[1]]);
  });

  it("will get one related entity", async () => {
    await ready;
    const alice = await User.get(2);

    expect((await alice.profiles.one()).bio).toBe("Designer");
    expect(await alice.profiles.one()).toBe(Profile.get(2));
    expect((await alice.profiles.one({ bio: "Designer" })).bio).toBe("Designer");
    await expect(alice.profiles.one({ bio: "Dev" }, false)).resolves.toBeUndefined();
    await expect(alice.profiles.one({ bio: "Dev" })).rejects.toThrow("No Profile found");
  });

  it("will insert with foreign key", async () => {
    await ready;
    const alice = await User.get(2);
    const profile = await alice.profiles.insert({ bio: "Manager" });

    expect(profile).toBeInstanceOf(Profile);
    expect(profile.columns).toEqual({ id: 4, user: 2, bio: "Manager" });
    expect(Profile.get(4)).toBe(profile);
  });

  it("will resolve load when awaited", async () => {
    await ready;
    const gabe = await User.get(1);
    const profiles = await gabe.profiles;

    expect(profiles.map(p => p.bio)).toEqual(["Writer", "Dev"]);
    expect(profiles[0]).toBe(Profile.get(3));
  });

  it("will reuse handle", async () => {
    await ready;
    const gabe = await User.get(1);

    expect(gabe.profiles).toBe(gabe.profiles);
  });

  it("will not be a Model", async () => {
    await ready;
    const gabe = await User.get(1);

    expect(gabe.profiles).not.toBeInstanceOf(Model);
    expect(Object.keys(gabe)).not.toContain("profiles");
    expect(() => { (gabe as any).profiles = null }).toThrow("read-only");
  });

  it("will suspend until parent is inserted", async () => {
    await ready;
    const bob = User.new({ name: "Bob" });
    const pending = (() => { try { return bob.profiles } catch (e) { return e } })();

    expect(pending).toBeInstanceOf(Promise);

    await pending;

    await expect(bob.profiles.query()).resolves.toEqual([]);
  });
});

describe("live", () => {
  class Table extends Type {
    static connection = Memory.new();
  }

  class Note extends Table {
    static table = "note";
    claim = one(Claim);
    text = str();
    kind = str({ fallback: "note" });
  }

  class Claim extends Table {
    static table = "claim";
    name = str();
    notes = rows(Note);
  }

  class Page extends Model {
    list: Note[] = [];
  }

  const texts = (list: Note[]) => list.map(note => note.text);

  it("will track insert and delete", async () => {
    const claim = await Claim.new({ name: "A" });
    const first = await claim.notes.insert({ text: "first" });
    const page = Page.new({ list: await claim.notes.load() });
    const seen: string[][] = [];

    page.get(({ list }) => {
      seen.push([...list].map(note => note.text));
    });

    expect(seen).toEqual([["first"]]);

    const second = await claim.notes.insert({ text: "second" });

    await vi.waitFor(() => expect(seen).toEqual([["first"], ["second", "first"]]));
    expect(page.list[0]).toBe(second);

    await first.delete();

    await vi.waitFor(() => expect(seen.at(-1)).toEqual(["second"]));

    second.set(null);

    await vi.waitFor(() => expect(seen.at(-1)).toEqual([]));
    expect(page.list.length).toBe(0);
    expect(page.list[0]).toBeUndefined();
  });

  it("will track length and index reads", async () => {
    const claim = await Claim.new({ name: "B" });
    const page = Page.new({ list: await claim.notes.load() });
    const lengths: number[] = [];

    page.get(({ list }) => {
      lengths.push(list.length);
      void list[0];
    });

    await claim.notes.insert({ text: "one" });
    await vi.waitFor(() => expect(lengths).toEqual([0, 1]));
  });

  it("will add from Class.new and Class.insert with matching key", async () => {
    const claim = await Claim.new({ name: "C" });
    const other = await Claim.new({ name: "D" });
    const list = await claim.notes.load();

    await Note.new({ claim, text: "new" });
    await Note.insert({ claim: claim.id, text: "inserted" });
    await Note.new({ claim: other, text: "other" });

    expect(texts(list)).toEqual(["inserted", "new"]);
    expect(list[0]).toBe(Note.get(list[0].id));
  });

  it("will not add entity failing the filter", async () => {
    const claim = await Claim.new({ name: "E" });
    const calls = await claim.notes.load({ kind: "call" });
    const all = await claim.notes.load();

    await claim.notes.insert({ text: "note" });
    await claim.notes.insert({ text: "call", kind: "call" });

    expect(texts(calls)).toEqual(["call"]);
    expect(texts(all)).toEqual(["call", "note"]);
  });

  it("will not add to a limited list", async () => {
    const claim = await Claim.new({ name: "F" });
    const limited = await claim.notes.load(undefined, 5);
    const offset = await claim.notes.load(undefined, undefined, 0);
    const skipped = await claim.notes.load(undefined, undefined, 1);

    await claim.notes.insert({ text: "x" });

    expect(texts(limited)).toEqual([]);
    expect(texts(offset)).toEqual(["x"]);
    expect(texts(skipped)).toEqual([]);
  });

  it("will drop deleted entity from a limited list", async () => {
    const claim = await Claim.new({ name: "G" });
    const note = await claim.notes.insert({ text: "x" });
    const limited = await claim.notes.load(undefined, 5);

    await note.delete();

    expect(limited).toEqual([]);
  });

  it("will keep a whole-table list", async () => {
    const all = await Claim.load();
    const before = all.length;
    const claim = await Claim.new({ name: "H" });

    expect(all.length).toBe(before + 1);
    expect(all[0]).toBe(claim);

    await Claim.delete(claim.id);

    expect(all.length).toBe(before);
  });

  it("will return plain arrays from map and filter", async () => {
    const claim = await Claim.new({ name: "I" });

    await claim.notes.insert({ text: "x" });

    const list = await claim.notes.load();
    const mapped = list.map(note => note.text);
    const filtered = list.filter(Boolean);

    expect(Array.isArray(list)).toBe(true);
    expect(mapped.constructor).toBe(Array);
    expect(filtered.constructor).toBe(Array);

    await claim.notes.insert({ text: "y" });

    expect(mapped).toEqual(["x"]);
    expect(filtered.length).toBe(1);
  });

  it("will resolve in an async set", async () => {
    const claim = await Claim.new({ name: "J" });

    await claim.notes.insert({ text: "x" });

    class View extends Model {
      notes = set(async () => claim.notes);
    }

    const view = View.new();
    const seen: string[][] = [];

    view.get(({ notes }) => {
      seen.push(notes.map(note => note.text));
    });

    await vi.waitFor(() => expect(seen).toEqual([["x"]]));

    await claim.notes.insert({ text: "y" });

    await vi.waitFor(() => expect(seen).toEqual([["x"], ["y", "x"]]));
  });

  it("will forget a collected list", async () => {
    const claim = await Claim.new({ name: "K" });
    const Ref = globalThis.WeakRef;

    vi.stubGlobal("WeakRef", class { deref(){} });

    try {
      await claim.notes.load();
    }
    finally {
      vi.stubGlobal("WeakRef", Ref);
    }

    const list = await claim.notes.load();

    await claim.notes.insert({ text: "x" });

    expect(texts(list)).toEqual(["x"]);
  });
});

describe("explicit field", () => {
  class Table extends Type {
    static connection = Memory.new();
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
    const gabe = await User.new({ name: "Gabe" });
    const alice = await User.new({ name: "Alice" });

    await gabe.authored.insert({ editor: alice });

    const [authored] = await gabe.authored.query();
    const [edited] = await alice.edited.query();

    expect(authored).toEqual(edited);
    expect(authored.author).toBe(gabe.id);
    expect(authored.editor).toBe(alice.id);
    expect(await alice.authored.query()).toEqual([]);
  });
});

describe("errors", () => {
  class Table extends Type {
    static connection = Memory.new();
  }

  it("will throw if no relationship found", async () => {
    class User extends Table {
      static table = "user"
      articles = rows(Article)
    }

    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.new({});

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

    const user = await User.new({});

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

    const gabe = await User.new({});

    expect(() => gabe.articles).toThrow("Field foobar does not exist on Article");
  });
});
