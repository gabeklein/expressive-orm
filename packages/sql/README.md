# @expressive/sql

Entities on [`@expressive/mvc`](https://github.com/gabeklein/expressive-mvc) Model, stored in SQLite with nothing else installed. Re-exports [`@expressive/orm`](https://github.com/gabeklein/expressive-orm/tree/main/packages/orm): entities, field helpers, `Query` and a connection come from this one import. Full guide: [README](https://github.com/gabeklein/expressive-orm#readme). Agent skill: [skills/expressive-sql](skills/expressive-sql/SKILL.md), shipped in the package with `expressive-orm`'s declared.

```sh
npm install @expressive/sql @expressive/mvc
```

SQLite is built into Bun (`bun:sqlite`) and Node 24 (`node:sqlite`). Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client` (0.18 or later); the first found is used.

```ts
import { Query, SQLiteConnection, Type, greaterThan, num, one, str } from '@expressive/sql';

class User extends Type {
  name = str();
  age = num(null);
}

class Post extends Type {
  author = one(User);
  title = str({ type: "varchar", length: 120 });
}

const db = await SQLiteConnection.new([User, Post], "app.db");

const gabe = await User.new({ name: "Gabe", age: 35 });
await Post.insert({ author: gabe, title: "Hello" });

const adults = await User.query({ age: greaterThan(17) });

const titles = await Query(where => {
  const post = where(Post);

  where(post.author.name).equal("Gabe");

  return post.title;
});

gabe.get(({ name }) => console.log(name));
await gabe.set({ name: "Gabriel" });

await db.close();
```

`SQLiteConnection.new(types, filename?)` binds the classes; awaiting it creates missing tables, adds missing columns and checks existing ones. SQLite cannot add a `unique` column or one defaulting to `"NOW"`; `sync` reports those. Omit `filename` for an in-memory database. In its place, pass a Cloudflare D1 binding, a libSQL client or a `libsql://` address - see [SQLite hosts](https://github.com/gabeklein/expressive-orm#sqlite-hosts).

## Also here

- `Connection` - the SQL connection base: orm's floor implemented over `Query`, so a dialect supplies `prepare` (with a `Generator` subclass) and `sync`.
- `Generator` - renders a `Query` builder as SQL.
- Driver seams - `Builder`, `DataTable`, `DataField`, `Parameter`, `Computed`, `QueryTemplate`, `Where` - import from `@expressive/orm/driver`. A dialect package lists `@expressive/orm` as a direct dependency, at the range this package depends on.
- `codecs` - how SQL stores each field helper's plain values, by helper; a dialect extends the map. `sql` - shorthand for orm's portable datatypes. See [Datatypes](https://github.com/gabeklein/expressive-orm#datatypes).

SQLite has no live rows - neither `node:sqlite` nor `bun:sqlite` exposes an update hook. For those, use [`@expressive/postgres`](https://github.com/gabeklein/expressive-orm/tree/main/packages/postgres).
