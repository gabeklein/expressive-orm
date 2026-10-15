# @expressive/sql

Entities on [`@expressive/mvc`](https://github.com/gabeklein/expressive-mvc) Model, stored in SQLite with nothing else installed. Re-exports [`@expressive/orm`](https://github.com/gabeklein/expressive-orm/tree/main/packages/orm): entities, field helpers, `Query` and a connection come from this one import. Full guide: [README](https://github.com/gabeklein/expressive-orm#readme).

```sh
npm install @expressive/sql @expressive/mvc
```

SQLite is built into Bun (`bun:sqlite`) and Node 24 (`node:sqlite`). Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client`; the first found is used.

```ts
import { Query, SQLiteConnection, Type, greaterThan, num, one, orNull, str } from '@expressive/sql';

class User extends Type {
  name = str();
  age = num(orNull);
}

class Post extends Type {
  author = one(User);
  title = str({ type: "varchar", length: 120 });
}

const db = await SQLiteConnection.new([User, Post], "app.db");

const gabe = await User.insert({ name: "Gabe", age: 35 });
await Post.insert({ author: gabe, title: "Hello" });

const adults = await User.find({ age: greaterThan(17) });

const titles = await Query(where => {
  const post = where(Post);

  where(post.author.name).equal("Gabe");

  return post.title;
});

gabe.get(({ name }) => console.log(name));
await gabe.update({ name: "Gabriel" });

await db.close();
```

`SQLiteConnection.new(types, filename?)` binds the classes; awaiting it creates missing tables and checks existing ones. Omit `filename` for an in-memory database.

## Also here

- `Connection` - the SQL connection base: orm's floor implemented over `Query`, so a dialect supplies `prepare` (with a `Generator` subclass) and `sync`.
- `Generator` - renders a `Query` builder as SQL.
- `StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn` - the column classes behind `str`, `num`, `bool`, `date` and `one`, carrying the SQL datatype vocabulary and its validation. See [Datatypes](https://github.com/gabeklein/expressive-orm#datatypes).

SQLite has no live rows - neither `node:sqlite` nor `bun:sqlite` exposes an update hook. For those, use [`@expressive/postgres`](https://github.com/gabeklein/expressive-orm/tree/main/packages/postgres).
