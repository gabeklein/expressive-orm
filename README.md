<br/>

<p align="center">
  <img height="90" src=".github/logo.svg" alt="Expressive Logo"/>
  <h1 align="center">
    Expressive ORM
  </h1>
</p>

<h4 align="center">
  Entities as reactive Models, stored in SQL.
</h4>

<p align="center">
  <a href="https://www.npmjs.com/package/@expressive/sql"><img alt="NPM" src="https://badge.fury.io/js/%40expressive%2Fsql.svg"></a>
</p>

<br/>

An entity is a class extending `Type`, which extends [`@expressive/mvc`](https://github.com/gabeklein/expressive-mvc) `Model`: one class is the schema, the domain model and an observable object. Everything comes from one import. `@expressive/sql` runs on embedded SQLite with nothing else installed; `@expressive/postgres` is the upgrade, and keeps loaded entities live as their rows change.

## Install

```sh
npm install @expressive/sql @expressive/mvc
```

SQLite is built into Bun and Node 24. Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client` (0.18 or later); the first found is used.

For Postgres:

```sh
npm install @expressive/postgres @expressive/mvc pg
# or embedded, in WASM
npm install @expressive/postgres @expressive/mvc @electric-sql/pglite
```

`@expressive/postgres` re-exports `@expressive/sql`, which re-exports `@expressive/orm`. Import from the one package you installed.

### Agent skills

Each package ships a skill for coding agents, versioned with the package - `expressive-orm`, `expressive-sql` and `expressive-postgres`, at `node_modules/@expressive/<pkg>/skills/`. Point your agent at them with a line in `AGENTS.md` (or `CLAUDE.md`):

```md
Before working with an `@expressive/*` package, read its skill at
`node_modules/@expressive/<pkg>/skills/expressive-<pkg>/SKILL.md`.
```

Or install the same instruction as a skill - `npx skills add gabeklein/expressive`. The docs an agent reads then match the installed version, with nothing to re-run after an upgrade.

## Entities

```ts
import { Type, bool, date, index, json, num, sql, str, unique } from '@expressive/sql';

class User extends Type {
  name = str(index);
  email = str(sql.varchar(255), unique);
  age = num(null);
  admin = bool({ fallback: false });
  joined = date.created();
  edited = date.updated();
  seen = date(null);
  prefs = json<{ theme: string }>(null);
  token = str(sql.uuid, null, { column: "api_token" });
}
```

| Helper | Value |
|---|---|
| `str()` | `string` |
| `num()` | `number` |
| `bool()` | `boolean` |
| `date()` | `Date` |
| `json<T>()` | `T`, stored as text; unparseable text reads `undefined` |

Options, in any order:

- `null` - nullable; the value is `T | undefined`.
- `optional` - may be left out of an insert, for a column the database fills; on Postgres a missing column is tolerated and reads `undefined`.
- `unique`, `index` - `sync` creates a missing index as `<table>_<column>`, or `{ index: "name" }`; on SQLite an existing single-column index on it counts.
- A datatype - `sql.*` or an object like `{ type: "varchar", length: 255 }`, see [Datatypes](#datatypes).
- `{ column }` - column name; default is the property in snake case.
- `{ fallback }` - column default, also optional on insert. `sql.now` is the database's current time in the column's storage; `"NOW"` is a deprecated alias.

Every helper has `.and(...presets)`: a helper with the same signature and those options applied first, so `const email = str.and(sql.varchar(255), unique)` declares `email = email()` the way the line above does. Types follow every option, preset or given. `date.created()` and `date.updated()` are presets of `date()` and default to `sql.now`. `created` is written on insert only - upserts leave it, and an update giving it fails to compile and throws. `updated` is set to now on every update and upsert that doesn't give it. Underneath they are `{ fixed: true }` and `{ update: sql.now }`, which any column takes; `update` also takes a function, called once per write. A `Query` assignment still writes a fixed column.

`orNull` and `uuid()` are deprecated for `null` and `str(sql.uuid)`.

The table is the class name in snake case; `static table` overrides it.

Every entity has an incrementing integer `id`. Declare it with `key` to rename the column or change its type:

```ts
import { Type, key, sql, str } from '@expressive/sql';

class Account extends Type {
  id = key({ column: "account_id" }); // number, increments
  name = str();
}

class Image extends Type {
  id = key(sql.text, { column: "name" }); // string, required on insert
}

class Session extends Type {
  id = key(sql.uuid); // string, a UUIDv7 generated on insert when absent
}
```

An integer `key` increments; another numeric type does not. `Account["id"]` is a `number`, `Session["id"]` a `string`; `one(id)`, `update(id)` and relations follow it. The property stays `id`.

`key` with an arrow declares a composite primary key - the fields it lists, in order, with no column of its own:

```ts
import { Type, key, one, str } from '@expressive/sql';

class Membership extends Type {
  id = key(() => [this.account, this.role]);
  account = one(Account);
  role = str();
}

await Membership.insert({ account: 1, role: "owner" }); // { id: '[1,"owner"]', account: 1, role: "owner" }

const owner = await Membership.get([1, "owner"]);
```

The arrow lists `this.<field>` reads and nothing else; it runs lazily, so `id` stays on top. `id` is a string - the parts as JSON - typed `Key<[number, string]>`, so it compares by value; read the parts from their fields. `Key` is exported to name it. `get`, `one`, `update` and `delete` take the key or the tuple; `sync` declares `PRIMARY KEY (account_id, role)`. `id` matches or orders by its parts - other operators throw - and `one()` cannot relate to a composite-keyed class.

## Connect

```ts
import { SQLiteConnection } from '@expressive/sql';

const db = await SQLiteConnection.new([User, Account, Session], "app.db");
```

`new(types, ...)` binds each class to the connection. Awaiting it runs `sync`: missing tables are created, missing columns and indexes added, existing ones checked against the classes. A column added to a class appears on reopen, reading `undefined` or its `fallback` on old rows; one that cannot fill existing rows - primary, or `NOT NULL` without a `fallback` - is reported and nothing changes. A nullable column defaulting to now is added without the default; inserts fill it. Type and nullability drift is reported; `sync(true, true)` rebuilds it - Postgres alters the column, SQLite rebuilds the table - and refuses while a row would not fit, like a NULL under `NOT NULL`; SQLite also checks each value converts. A SQLite rebuild keeps columns not on the class, indexes and triggers, but not UNIQUE or REFERENCES on columns the class doesn't declare, and refuses while any row references a missing one. SQLite connections enforce foreign keys. `sync(false)` only verifies. `plan(force?)` returns what `sync` would do - `{ steps, problems }`, each step with its `action`, `reason` and `sql` - without doing it. A sync applies in one transaction. Omit the filename for an in-memory database. `await db.close()` releases it and destroys every entity loaded through it.

```ts
import { PGConnection, PGLiteConnection } from '@expressive/postgres';

const pg = await PGConnection.new([User], "postgres://localhost/app");
const lite = await PGLiteConnection.new([Account], "./data");
```

`PGConnection` takes a connection string, a `pg` `PoolConfig` or a `Pool`. `PGLiteConnection` takes a data directory (in memory when omitted) or a `PGlite` instance, then `PGliteOptions`. `close()` leaves a passed `Pool` or `PGlite` open.

`SQLiteConnection` takes a filename, or an `Engine` in its place for a SQLite the built-in loader can't open: any object with `all(sql, params)`, `get(sql, params)`, `run(sql, params)` returning `{ changes }`, `exec(sql)` and `close()`, each async. A given engine is used as is - turn on foreign keys yourself where the host doesn't - and `close()` leaves it open.

Two optional members cover hosts without `BEGIN` and `COMMIT` on one connection. `transaction()` returns a session - the same four statements plus `commit()` and `rollback()` - and every statement inside `transaction(fn)` runs on it. `batch(sql)` runs statements atomically, and `sync` applies through it. A rebuild in a batch needs foreign keys off, or dropping the old table would cascade; on an engine that keeps them on, it is refused.

### SQLite hosts

In place of the filename, `SQLiteConnection` also takes a Cloudflare D1 binding, a libSQL client or a libSQL address, told apart by shape. A given binding or client is used as is, and `close()` leaves it open.

On Workers, open the connection once, from the first request's binding, and drop it when `sync` fails so the next request retries:

```ts
import { SQLiteConnection } from '@expressive/sql';

let ready: Promise<unknown> | undefined;

function open(DB: D1Database){
  const db = SQLiteConnection.new([User], DB);

  return Promise.resolve(db).catch(async error => {
    ready = undefined;
    await db.close();
    throw error;
  });
}

export default {
  async fetch(request: Request, env: { DB: D1Database }) {
    await (ready ??= open(env.DB));

    return Response.json(await User.find({}));
  }
};
```

`sync` costs a few D1 round trips per table on each cold start, and applies as one batch. D1 has no interactive transactions - `transaction` throws. It keeps foreign keys on, so `sync(true, true)` refuses to rebuild a table.

```ts
const turso = await SQLiteConnection.new([User], `libsql://app-org.turso.io?authToken=${process.env.TURSO_TOKEN}`);
```

An address starting `libsql:`, `https:`, `http:`, `ws:` or `wss:` opens a `@libsql/client` (0.18 or later), which reads the token from `?authToken=`. The address form loads `@libsql/client` at runtime, which a bundle such as a Worker's does not include - there, pass a client from `createClient` instead. An `undefined` or empty source opens in memory, so check an address read from the environment before passing it.

Every libSQL client runs each `transaction` on a libSQL write transaction (`BEGIN IMMEDIATE`) holding the connection's lock, so transactions run one at a time across the app. `sync` applies as one batch; a table rebuild runs through the client's `migrate`, which turns foreign keys off for it alone. Local libSQL enforces foreign keys by default; `PRAGMA foreign_keys` is per connection, so a remote client gets the server's setting.

Without SQL, `memory()` keeps rows in arrays - for tests and prototypes:

```ts
import { Type, memory, str } from '@expressive/sql';

class Note extends Type {
  static connection = memory();
  text = str();
}
```

### Command line

```sh
expressive sql check src/db.ts        # list what sync would change; exit 1 if anything would
expressive sql sync src/db.ts         # create missing tables, columns and indexes
expressive sql sync --force src/db.ts # also rebuild drifted columns
```

The entry is the module that creates your connections; it is imported with `sync` held back, so `await Connection.new()` resolves without touching the database, and the command plans and syncs each connection it created. A TypeScript entry needs Bun (`bunx --bun expressive ...`) or Node 22.18+. `expressive` is shared by `@expressive/*` packages: `expressive <package> ...` runs the command an installed package declares.

## Read and write

```ts
import { asc, greaterThan, isLike, lessThan } from '@expressive/sql';

const gabe = await User.insert({ name: "Gabe", email: "gabe@example.com", age: 35 });

await User.one(gabe.id);                       // the row
await User.one({ email: "gabe@example.com" }); // throws if not found
await User.one({ name: "Nobody" }, false);     // undefined if not found

const users = await User.find({
  name: [isLike("G%"), asc()],
  age: [greaterThan(17), lessThan(65)]
}, 10, 0);

for await (const page of User.all(100))
  console.log(page.length);
```

Reads and `insert` return plain rows: decoded values by property, a relation as its id, frozen. `insert` returns the stored row, with its `id` and database defaults. For an instance to observe or edit, take a [reference](#references).

```ts
await User.insert(row, { conflict: "update" });                     // upsert on the primary key
await User.insert(row, { conflict: "replace" });                    // every column from row; omitted ones reset
await User.insert(row, { conflict: "update", keep: ["createdAt"] }); // leave columns alone on conflict
await User.insert(row, { conflict: "update", on: "email" });        // target a unique column
await User.insert(row, { conflict: "ignore" });                     // undefined if the row exists
```

A `conflict` updates the existing row with every column given, minus the target, `keep` and `date.created` columns, and returns it, settling into a loaded instance; `"replace"` sets every column but the primary key, an omitted one to its default or NULL; `"ignore"` leaves it and resolves `undefined`. Columns with an `update` value take it on conflict; a new row gets its `fallback`. `on` takes a key or an array of keys; the default is the primary key.

Operators: `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `isLike`, `isIn`, `notIn`, `isNull`, `notNull`, and `asc` / `desc` for order. A plain value is `equal`, `null` is `isNull`; an array applies each. `isLike` matches stored text, also on a `json()` column. `sql.now` stands for the current time in a statics write or comparison; statics read it from the app's clock, so a settled instance holds the exact value written.

```ts
await UserAsset.count({ kind: "loras", file });                   // matching rows
await Asset.delete({ file });                                    // resolves the rows deleted
await Session.delete({ expires: lessThan(sql.now) });
await Image.update({ model: from }, { model: to });              // resolves the rows changed
```

A query object in place of an id writes every matching row, settling into or destroying loaded instances; an empty one throws. `count()` with no query counts the table.

```ts
const ann = await User.new({ name: "Ann", email: "ann@example.com" });

await ann.set({ age: 28, admin: true });
await ann.delete();

await User.update(gabe.id, { age: 36 });
await User.delete(gabe.id);
```

An instance is read-only: assigning a field throws. `Type.new(values)` inserts a row and returns its instance at once, like a [reference](#references) - columns suspend until the row lands, and awaiting resolves to the instance with its `id` and defaults, in the identity map. A failed insert destroys it and rejects awaits and pending reads; awaited, it stops there, otherwise mvc reports it to `catch` as `setup`. `await entity.set(patch)` writes the patch, then settles the stored values into the instance, notifying observers once, and resolves to the keys that changed; `null` clears a nullable column. Other `set` forms are Model's. `delete()` removes the row and destroys the instance. `User.update(id, data)` and `User.delete(id)` write by id, settling into or destroying a loaded instance. `entity.columns` is its row - decoded values by property, a relation as its id, never loading - in the shape `insert` takes; `entity.get()` is the full snapshot.

## References

```ts
const user = User.get(1); // the loaded entity, or a placeholder loading it

user.get(({ name }) => console.log(name)); // runs once the row lands

await user; // the entity
```

`Type.get(id)` is synchronous: the entity from the identity map, or a placeholder registered there at once, so concurrent gets share it. A placeholder's columns suspend until the row lands - a read throws a promise, which an effect or a React component waits for. Awaiting a reference resolves to the entity; `get(id)` and `Type.new` return `Type.Async<User>` - the entity, typed awaitable. A missing row rejects awaits and pending reads with `No User found with id 1` and leaves the identity map. `get(User, id)` in a Model, or `this.get(User, id)`, resolves through the same path, typed as the entity; `User.get()` with no id stays Model's context lookup.

```ts
const users = await User.load({ admin: true }, 20); // entities, in one select

await users[0].set({ age: 36 });
```

`Type.load(where?, limit?, offset?)` is `find` returning entities: the same filter and order, one select for the whole call. An entity already in the identity map settles the fetched row and is returned as is; the rest join the map loaded. Omit `limit` for every match.

## Relations

```ts
import { Type, lazy, one, rows, str } from '@expressive/sql';

class Author extends Type {
  name = str();
  posts = rows(Post, "author");
}

class Post extends Type {
  title = str();
  author = one(Author);
  editor = one(Author, null, lazy);
}
```

`author = one(Other)` stores `author_id` - `{ column }` names another, and two fields on one column throw - and loads the related entity with its parent; with `lazy`, on first read. A related entity is a reference: shared by every parent pointing at its row, never owned or destroyed by them. `set`, an insert or a filter takes an entity, an id or a row.

`rows(Other, key?)` is a handle on the rows pointing back - `find`, `load`, `one` and `insert` with the foreign key applied. `key` is needed only when `Other` has more than one relation to this class.

```ts
const author = await Author.new({ name: "Gabe" });
const post = await author.posts.insert({ title: "Hello", editor: author });

await author.posts.find();                  // rows, equal to [post]
await author.posts.load();                  // entities, [post] itself
await author.posts.one({ title: "Hello" }); // a row equal to post
console.log(post.author === author.id);     // true
```

## Entities are Models

Observe entities, render them, nest them - see [expressive-mvc](https://github.com/gabeklein/expressive-mvc).

```ts
const user = await User.get(1);

user.get(({ name, age }) => {
  console.log(name, age);
});

user.set(key => {
  console.log("changed", key);
});

await user.set({ age: 36 });
```

`get(effect)` runs now and again when a property it read changes. `set(callback)` is called for every change. Both return a function to stop.

A lazy relation suspends: its first read throws a promise, which an effect or a React component waits for. Await an async effect to read one once it loads.

```ts
const first = await Post.get(1);

first.get(({ editor }) => {
  console.log(editor?.name);
});

const editor = await first.get(async ($) => $.editor);
```

## Query

`Query` builds a statement from a callback. `where(Class)` adds a table and returns its columns, `where(column)` a condition; the return value is the selection.

```ts
import { Query } from '@expressive/sql';

const names = await Query(where => {
  const user = where(User);

  where(user.age).over(17);
  where(user.name).asc();
  where(10);

  return user.name;
});

const titles = await Query(where => {
  const post = where(Post);

  where(post.author.name).equal("Gabe");

  return { title: post.title, by: post.author.name };
});
```

- Return a column for its values, an object for rows of that shape, a table for its rows - frozen, a table as from `find` at any depth (`undefined` for a missing left join).
- `where(...conditions)` groups them with `or`; a group inside a group alternates to `and`.
- Comparisons: `equal`, `not`, `over`, `under` (`true` for or-equal), `in`.
- A `one()` relation joins on access: inner when required, left when nullable. `where(Other)` joins another table, `where(Other, true)` left joins it.
- `query.one()` resolves the first row, `query.one(true)` throws without one.
- `where(table).match({ kind, file })` adds an `equal` per key.
- `sql.now` renders as the database's current time, matching the column it meets.
- A query is a `Promise` and runs when awaited, once per `then`.

```ts
const promoted = await Query(where => {
  const user = where(User);

  where(user.age).over(30);
  where(user).update({ admin: true });
});

await Query(where => {
  const user = where(User);

  where(user.name).equal("Nobody");
  where(user).delete();
});

await Query(where => {
  where(User, { name: "Cam", email: "cam@example.com" });
});
```

A write resolves the rows affected. A function returned from the callback makes a template, built once:

```ts
const byName = Query(where => (name: string) => {
  const user = where(User);

  where(user.name).equal(name);

  return user;
});

const [found] = await byName("Gabe");
```

`Type.query` starts from the class:

```ts
const admins = User.query((user, where) => {
  where(user.admin).equal(true);
});

console.log(String(admins));
```

`String(query)` is the SQL the connection runs; without a connection, or on `memory()`, it lists the query's intent. A second callback argument holds math (`add`, `sub`, `mul`, `div`, `mod`, `neg`) and `bit` operators; a template string, from `where` or that helper, embeds raw SQL. `memory()` runs everything but raw SQL.

## Transactions

```ts
const ann = await db.transaction(async () => {
  const ann = await User.insert({ name: "Ann", email: "ann@example.com" });

  await User.update(gabe.id, { admin: true });

  return ann;
});
```

`transaction(fn)` runs `fn` in one database transaction: it commits when `fn` resolves, to its result, and rolls back when it throws, rethrowing. Statements inside - statics, `Query`, instance writes, and effects they trigger - join it without a handle. A nested `transaction` joins the open one, so a nested failure is undone only if it reaches the outer `fn`; caught, its writes commit with the rest. Instances change as writes land; a rollback restores what they changed, destroys entities created inside, and keeps entities deleted inside, which a commit then destroys. Values read into an instance inside a rolled-back transaction stay.

On SQLite, PGlite and `memory()`, other statements on the connection wait until it ends, and transactions run one at a time. `pg` runs each on its own client from the pool, side by side. On `memory()` a rollback restores every table and the next id, and subscribers hear of changes once it commits. It needs `AsyncLocalStorage` - Bun, Node, Deno, and Workers with `nodejs_compat` - and throws where that is missing, such as PGlite or `memory()` in a browser. D1 refuses `transaction`.

## Hooks

```ts
const db = await SQLiteConnection.new([User, Upload], "app.db");

db.before(Upload, {
  delete(upload){
    if (upload.locked)
      throw new Error("Upload is locked.");
  }
});

db.after(Upload, {
  async delete(upload){
    await bucket.delete(upload.path);
  }
});
```

`connection.before(Type, hooks)` and `connection.after(Type, hooks)` register handlers on the host that owns the connection, and each returns a function that removes them. Classes bound to another connection, such as a browser client sharing them, never run them. Both see deletes by id - `entity.delete()`, `Type.delete(id)`, or `remove(table, id)` called directly, as a remote client does - and receive the row as `find` returns it. A delete by filter, a `Query` delete or a database cascade runs neither. With a handler registered for the table, a delete by id selects its row once for both phases; without one, it does not. A missing row runs neither.

`before` is a gate: its handlers run in order before the row is removed, inside the `transaction` when there is one. A throw or rejection cancels the delete - the row stays, no `after` handler runs, and the error reaches the caller.

`after` is best effort: every handler runs after the row is removed and is awaited before the delete resolves. A throw or rejection is logged with `console.error` and never fails the delete. Inside a `transaction` they run after the commit, once the connection is released, and before `transaction` resolves; they never run on rollback.

## Live rows

A connection with `subscribe` keeps loaded entities current with changes made elsewhere - another process, another client, a `Query` update. Observers see them as any other change.

```ts
import { PGlite } from '@electric-sql/pglite';
import { PGLiteConnection, Type, str } from '@expressive/postgres';

class Task extends Type {
  title = str();
}

const client = new PGlite();
const tasks = await PGLiteConnection.new([Task], client);
const task = await Task.new({ title: "Draft" });

task.get(({ title }) => console.log(title));

await client.query(`UPDATE task SET title = 'Final' WHERE id = $1`, [task.id]);
```

- An update settles into the entity.
- A delete destroys the entity.
- An insert changes nothing loaded.

`memory()` reports every write, floor or `Query`. Postgres uses LISTEN/NOTIFY: `sync` installs a trigger per table (Postgres 14+) - see [`@expressive/postgres`](packages/postgres). SQLite has no live rows: neither `node:sqlite` nor `bun:sqlite` exposes an update hook.

## Datatypes

A field declares a portable datatype; each connection decides how to store it. The same schema module - importing only `@expressive/orm` - binds to SQLite, D1, Postgres, `memory()` or a connection forwarding to a server, unchanged. `sql.*` is shorthand for the declaration; an object says the same: `str(sql.varchar(40))` is `str({ type: "varchar", length: 40 })`.

| Helper | Datatype | SQLite | Postgres |
|---|---|---|---|
| `str` | `text` (default), `varchar(n)`, `char(n)`, `uuid` | TEXT | TEXT, VARCHAR(n), CHAR(n), UUID |
| `num` | `integer` (default), `smallint`, `bigint`, `real`, `double`, `numeric(p, s)`, `decimal(p, s)` | INTEGER, REAL, NUMERIC | the type, `(precision, scale)` where set |
| `bool` | `boolean` | INTEGER | BOOLEAN |
| `date` | `timestamp` (default), `date`, `time`; `timezone` on `timestamp` and `time` | TEXT | TIMESTAMP(p), DATE, TIME(p), with TZ |
| `json` | - | TEXT | TEXT |
| `one` | the related key's | the key's | the key's |

A datatype of another helper, like `num(sql.text)`, is a type error, whatever the module imports. Options a factory doesn't take, like `precision` on `timestamp`, go in an object: `date({ type: "timestamp", precision: 3 })`. `@expressive/postgres` adds `sql.timestamptz` and `sql.timetz`.

The field checks every value before it is written, the same on every side: a `str` is a string within `length`, a `num` an integer within its range unless `real`, `double` or decimal, a decimal within its precision and scale, a `bool` a boolean, a `date` a Date, date string or epoch milliseconds. A connection takes and returns plain values - Dates, booleans, numbers, JSON values - and stores them its own way: SQLite and D1 keep a `timestamp` as ISO 8601 UTC text to the millisecond and booleans as 1 or 0; Postgres keeps a `timestamp` without time zone as UTC. A `date({ type: "date" })` is a calendar day, not an instant: a Date gives its local day, a `"YYYY-MM-DD"` string is that day, and it reads back as local midnight - build one with `new Date(y, m - 1, d)`. It crosses every connection as the text `YYYY-MM-DD` and is stored that way, so a client and a server in different time zones agree on the day. `sql.now` on such a column is the database's UTC day. A `time` is a UTC time of day: stored `HH:MM:SS`, it crosses as a Date on 1970-01-01 UTC, an instant every zone reads alike. A SQL connection checks each value with its field again before storing it, so a row forwarded from a client meets the server's rules. `Connection.new` throws when a bound class has a field it can't store, like `SQLiteConnection can't store date type 'interval' (Event.length).`

```ts
import { Type, num, sql, str } from '@expressive/sql';

class Product extends Type {
  code = str(sql.char(3));
  price = num(sql.numeric(10, 2));
}
```

## Drivers

A connection is a `Connection`, itself a Model. The floor every driver implements, keyed by table name and the class's primary column:

| Method | Does |
|---|---|
| `select(table, constraints, limit?, offset?)` | rows matching `[column, op, value]` tuples |
| `insert(table, data, returns?, conflict?)` | inserts a row, returning it when asked; `conflict` is `{ on, update?, set? }` by column - `update` absent does nothing, otherwise those columns are overwritten from the row and `set`'s columns with its values |
| `update(table, id, data)` | updates one row |
| `remove(table, id)` | deletes one row |

The floor takes and returns plain values by column - what the fields check and read, Dates and JSON values included, a calendar day as `YYYY-MM-DD` - so a driver can forward it as is. A composite `id` reaches the driver as its tuple, in the order `key` lists the parts; `fields.get("id").parts` lists them.

A driver storing values its own way sets a protected `codecs` getter: a map from each base helper - `str`, `num`, `bool`, `date`, `json` - to a `Connection.Codec` with the `types` it stores, a schema `datatype(field)`, and `encode` and `decode` between plain and stored values. A field resolves its codec by `field.helper`, a relation by the key it references. `Connection.new` throws for a field none of them can store. `_encode`, `_decode` and `_datatype` apply them; `Builder.encode` and `Builder.decode` do so for a `Query`, after the field's own check. `@expressive/sql` exports its `codecs` for a dialect to extend.

Optional capabilities: `prepare(builder)` runs a `Query` - without it `Query` and `Type.query` throw; `subscribe(listener)` reports changes for live rows; `sync(fix?)` checks or creates the schema, and runs when the connection is awaited; a protected `transact(fn)` runs `fn` in one transaction - `BEGIN`, `fn`, `COMMIT` or `ROLLBACK` on SQL - and enables `transaction(fn)`. `Connection` implements `transaction` over it: it takes the connection's lock, scopes the transaction with `AsyncLocalStorage` so statements inside join it, and keeps the journal that restores instances on rollback; `_journal()` returns it, and a driver may keep its own handle on its `session`. A driver calls `idle()` before each statement so it waits out another's transaction; a pooled driver overrides `lock()` and `idle()` to run transactions side by side.

To write a driver, extend `Connection` from `@expressive/orm` and implement the floor - entities, relations, writes and the identity map work on that alone. For a SQL database extend `Connection` from `@expressive/sql`: it implements the floor over `Query`, leaving `prepare` (with a `Generator` subclass for the dialect) and `sync`.

Driver seams - `Builder`, `evaluate`, `Where` and a SQL generator's values - import from `@expressive/orm/driver`.

A driver without a query language can run `Query` in JS, the way `memory()` does: `evaluate(store, builder, params)` returns `{ rows, count }`, so `prepare` is `all` resolving `rows` and `run` resolving `count`. The store reads and writes one table at a time:

| Method | Does |
|---|---|
| `rows(table, where)` | the table's rows; `where` holds the `[column, op, value]` tuples the query puts on that table alone, for a store that can filter - returning more is fine |
| `insert(table, row)` | adds a row, returning it as stored, key included |
| `update(table, row, assign)` | writes `assign` to one row, once per row |
| `delete(table, rows)` | removes rows |

`table` is the query's table, with `name` and the class as `type`. The rows `rows` and `insert` return are the ones handed back to `update` and `delete`, so a store can find its record by identity. Joins, filters, ordering and computed values run over them.

```ts
import { Connection, Type, memory, str } from '@expressive/orm';

class Logged extends Connection {
  inner = memory();

  select(...args: Parameters<Connection["select"]>){
    console.log("select", args[0]);
    return this.inner.select(...args);
  }

  insert(...args: Parameters<Connection["insert"]>){
    console.log("insert", args[0]);
    return this.inner.insert(...args);
  }

  update(...args: Parameters<Connection["update"]>){
    return this.inner.update(...args);
  }

  remove(...args: Parameters<Connection["remove"]>){
    return this.inner.remove(...args);
  }
}

class Item extends Type {
  label = str();
}

Logged.new([Item]);

await Item.insert({ label: "one" });
await Item.find();
```

## Deprecated

`@expressive/sqlite` is deprecated: `@expressive/sql` includes the SQLite connection. Install `@expressive/sql` and change the import:

```diff
- import { SQLiteConnection } from '@expressive/sqlite';
+ import { SQLiteConnection } from '@expressive/sql';
```

## License

ISC
