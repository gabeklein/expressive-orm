import { has, Model, set } from '@expressive/mvc';
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
    expect(profile.user).toBe(alice);
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
  }

  class Claim extends Table {
    static table = "claim";
    name = str();
    notes = rows(Note);
  }

  const texts = (list: Iterable<Note>) => Array.from(list, note => note.text);

  it("will resolve itself when awaited", async () => {
    const claim = await Claim.new({ name: "A" });

    await claim.notes.insert({ text: "first" });
    await claim.notes.insert({ text: "second" });

    const notes = await claim.notes;

    expect(notes).toBe(claim.notes);
    expect(notes).toBeInstanceOf(has.List);
    expect(texts(notes)).toEqual(["second", "first"]);
    expect("then" in notes).toBe(false);
    expect(await claim.notes).toBe(notes);
  });

  it("will suspend a read until loaded", async () => {
    const claim = await Claim.new({ name: "B" });

    await claim.notes.insert({ text: "x" });

    const thrown = (() => { try { return claim.notes.size } catch (e) { return e } })();

    expect(thrown).toBeInstanceOf(Promise);

    await thrown;

    expect(claim.notes.size).toBe(1);
    expect(claim.notes.get(0)!.text).toBe("x");
  });

  it("will add inserted entity first", async () => {
    const claim = await Claim.new({ name: "C" });
    const notes = await claim.notes;
    const first = await notes.insert({ text: "first" });
    const second = await notes.insert({ text: "second" });

    expect(texts(notes)).toEqual(["second", "first"]);
    expect(notes.get(0)).toBe(second);
    expect(notes.get(1)).toBe(first);
  });

  it("will drop deleted and destroyed entities", async () => {
    const claim = await Claim.new({ name: "D" });
    const first = await claim.notes.insert({ text: "first" });
    const second = await claim.notes.insert({ text: "second" });
    const third = await claim.notes.insert({ text: "third" });
    const notes = await claim.notes;

    await second.delete();
    expect(texts(notes)).toEqual(["third", "first"]);

    third.set(null);
    expect(texts(notes)).toEqual(["first"]);

    await Note.delete(first.id);
    expect(notes.size).toBe(0);
  });

  it("will update an effect reading the entity", async () => {
    const claim = await Claim.new({ name: "E" });
    const seen: string[][] = [];

    claim.get(({ notes }) => {
      seen.push(texts(notes));
    });

    await vi.waitFor(() => expect(seen).toEqual([[]]));

    const note = await claim.notes.insert({ text: "x" });

    await vi.waitFor(() => expect(seen).toEqual([[], ["x"]]));

    await note.delete();

    await vi.waitFor(() => expect(seen).toEqual([[], ["x"], []]));
  });

  it("will resolve in an async set", async () => {
    const claim = await Claim.new({ name: "F" });

    class View extends Model {
      notes = set(async () => claim.notes);
    }

    const view = View.new();
    const seen: string[][] = [];

    view.get(({ notes }) => {
      seen.push(notes.map(note => note.text));
    });

    await vi.waitFor(() => expect(seen).toEqual([[]]));
    expect(view.notes).toBe(claim.notes);

    await claim.notes.insert({ text: "x" });

    await vi.waitFor(() => expect(seen).toEqual([[], ["x"]]));
  });

  it("will not add an insert twice while loading", async () => {
    const claim = await Claim.new({ name: "G" });
    const load = Note.load.bind(Note);
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);

    vi.spyOn(Note, "load").mockImplementationOnce(async (...args: any[]) => {
      await gate;
      return load(...args);
    });

    const loading = Promise.resolve(claim.notes);
    const note = await claim.notes.insert({ text: "x" });

    release();

    const notes = await loading;

    await vi.waitFor(() => expect(texts(notes)).toEqual(["x"]));
    expect(notes.get(0)).toBe(note);
  });

  it("will not change on other writes", async () => {
    const claim = await Claim.new({ name: "H" });
    const notes = await claim.notes;

    await Note.new({ claim, text: "elsewhere" });
    await Note.insert({ claim: claim.id, text: "inserted" });
    await claim.notes.insert({ text: "here" });

    expect(texts(notes)).toEqual(["here"]);
    expect((await claim.notes.load()).map(note => note.text)).toEqual(["here", "inserted", "elsewhere"]);
  });

  it("will not add a failed insert", async () => {
    const claim = await Claim.new({ name: "I" });
    const notes = await claim.notes;

    // @ts-expect-error
    await expect(claim.notes.insert({})).rejects.toThrow("Missing required field: text");
    expect(notes.size).toBe(0);
  });

  it("will retry a failed load", async () => {
    const claim = await Claim.new({ name: "J" });

    vi.spyOn(Note, "load").mockRejectedValueOnce(new Error("offline"));

    await expect(Promise.resolve(claim.notes)).rejects.toThrow("offline");
    await claim.notes.insert({ text: "x" });

    expect(texts(await claim.notes)).toEqual(["x"]);
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
