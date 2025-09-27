import { Table, str, one, get } from "../tests/Table";

describe("get", () => {
  class Profile extends Table {
    static table = "profile";
    user = one(User);
    bio = str();
  }

  class User extends Table {
    static table = "user";
    name = str();
    profiles = get(Profile); // should infer user
  }

  beforeAll(async () => {
    await Table.connection.init(`
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY,
        name TEXT
      );
      CREATE TABLE IF NOT EXISTS profile (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "user"(id),
        bio TEXT
      );
      INSERT INTO "user" (id, name) VALUES (1, 'Gabe'), (2, 'Alice');
      INSERT INTO "profile" (id, user_id, bio) VALUES (1, 1, 'Dev'), (2, 2, 'Designer');
    `);
  })

  it("will infer one-to-many relationships", async () => {
    const gabe = await User.one(1);
    const gabeProfiles = await gabe.profiles.get();
    expect(gabeProfiles).toHaveLength(1);
    expect(gabeProfiles[0].bio).toBe("Dev");
  });

  it.skip("will create on instance", async () => {
    const bob = await User.new({ name: "Bob" });

    // @ts-expect-error
    bob.profiles.insert({ bio: "Manager" });
  });
});

describe("errors", () => {
  beforeAll(async () => {
    Table.connection.init(`
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY,
        name TEXT
      );

      CREATE TABLE IF NOT EXISTS article (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "user"(id),
        title TEXT
      );

      INSERT INTO "user" (name) VALUES ('Gabe'), ('Alice');
      INSERT INTO article (user_id, title) VALUES (1, 'Hello World'), (2, 'Design Patterns');
    `)
  })

  it("will throw if no relationship found", async () => {
    class User extends Table {
      static table = "user"
      articles = get(Article)
    }
    class Article extends Table {
      static table = "article"
    }

    const gabe = await User.one(1);
    const getArticles = () => gabe.articles.get();

    expect(getArticles).toThrow();
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

    const gabe = await User.one(1);
    const getArticles = () => gabe.articles.get();

    expect(getArticles).toThrow("Field foobar does not exist on Article");
  });
});