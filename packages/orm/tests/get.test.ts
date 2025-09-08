import { Table, str, one, get } from "./Table";

class User extends Table {
  static table = "user";
  name = str();
  profiles = get(Profile); // should infer user_id
}

class Profile extends Table {
  static table = "profile";
  user = one(User);
  bio = str();
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