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

SQLite is built into Bun and Node 24. Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client`; the first found is used.

For Postgres:

```sh
npm install @expressive/postgres @expressive/mvc pg
# or embedded, in WASM
npm install @expressive/postgres @expressive/mvc @electric-sql/pglite
```

`@expressive/postgres` re-exports `@expressive/sql`, which re-exports `@expressive/orm`. Import from the one package you installed.

## Entities

```ts
import { Type, bool, date, json, num, orNull, str, uuid } from '@expressive/sql';

class User extends Type {
  name = str();
  email = str({ type: "varchar", length: 255, unique: true });
  age = num(orNull);
  admin = bool({ fallback: false });
  joined = date({ fallback: "NOW" });
  prefs = json<{ theme: string }>(orNull);
  token = uuid(orNull, { column: "api_token" });
}
```

| Helper | Value |
|---|---|
| `str()` | `string` |
| `num()` | `number` |
| `bool()` | `boolean` |
| `date()` | `Date` |
| `json<T>()` | `T`, stored as text |
| `uuid()` | `string` |

Options, in any order:

- `orNull` (or `null`) - nullable; the value is `T | undefined`.
- `optional` - may be left out of an insert, for a column the database fills; on Postgres a missing column is tolerated and reads `undefined`.
- `{ column }` - column name; default is the property in snake case.
- `{ fallback }` - column default, also optional on insert. `"NOW"` is `CURRENT_TIMESTAMP`.
- `{ unique, type, length, precision, scale }` - see [Datatypes](#datatypes).

The table is the class name in snake case; `static table` overrides it.

Every entity has `id = num({ primary: true, increment: true })`. Redeclare it to rename the column or change its type:

```ts
import { Type, num, str, uuid } from '@expressive/sql';

class Account extends Type {
  id = num({ column: "account_id", primary: true, increment: true });
  name = str();
}

class Session extends Type {
  id = uuid({ primary: true });
}
```

`Account["id"]` is a `number`, `Session["id"]` a `string`; `one(id)`, `update(id)` and relations follow it.

## Connect

```ts
import { SQLiteConnection } from '@expressive/sql';

const db = await SQLiteConnection.new([User, Account, Session], "app.db");
```

`new(types, ...)` binds each class to the connection. Awaiting it runs `sync`: missing tables are created, existing ones checked against the classes. Omit the filename for an in-memory database. `await db.close()` releases it and destroys every entity loaded through it.

```ts
import { PGConnection, PGLiteConnection } from '@expressive/postgres';

const pg = await PGConnection.new([User], "postgres://localhost/app");
const lite = await PGLiteConnection.new([Account], "./data");
```

`PGConnection` takes a connection string, a `pg` `PoolConfig` or a `Pool`. `PGLiteConnection` takes a data directory (in memory when omitted) or a `PGlite` instance, then `PGliteOptions`. `close()` leaves a passed `Pool` or `PGlite` open.

Without SQL, `memory()` keeps rows in arrays - for tests and prototypes:

```ts
import { Type, memory, str } from '@expressive/sql';

class Note extends Type {
  static connection = memory();
  text = str();
}
```

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

Operators: `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `isLike`, `isIn`, `notIn`, `isNull`, `notNull`, and `asc` / `desc` for order. A plain value is `equal`; an array applies each.

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

## Relations

```ts
import { Type, lazy, one, orNull, rows, str } from '@expressive/sql';

class Author extends Type {
  name = str();
  posts = rows(Post, "author");
}

class Post extends Type {
  title = str();
  author = one(Author);
  editor = one(Author, orNull, lazy, { column: "editor_id" });
}
```

`one(Other)` stores `other_id` - a second relation to the same class needs its own `column` - and loads the related entity with its parent; with `lazy`, on first read. A related entity is a reference: shared by every parent pointing at its row, never owned or destroyed by them. `set`, an insert or a filter takes an entity, an id or a row.

`rows(Other, key?)` is a handle on the rows pointing back - `find`, `one` and `insert` with the foreign key applied. `key` is needed only when `Other` has more than one relation to this class.

```ts
const author = await Author.new({ name: "Gabe" });
const post = await author.posts.insert({ title: "Hello", editor: author });

await author.posts.find();                  // rows, equal to [post]
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

`type` picks the column type. A config is portable: the same class syncs on SQLite and Postgres.

| Helper | `type` | SQLite | Postgres |
|---|---|---|---|
| `str` | `text` (default), `varchar`, `char`, `uuid` | TEXT | TEXT, VARCHAR(n), CHAR(n), UUID |
| `num` | `integer` (default), `smallint`, `bigint`, `real`, `float`, `double`, `numeric`, `decimal` | INTEGER, REAL, NUMERIC | the type, `(precision, scale)` where set |
| `bool` | `boolean` (default), `integer` (1/0), `text` / `varchar` with `either` | INTEGER, TEXT | BOOLEAN, INTEGER, TEXT, VARCHAR |
| `date` | `timestamp` (default), `date`, `time`, `integer` (unix seconds), `text` | TEXT, INTEGER | TIMESTAMP(p), DATE, TIME(p), INTEGER, TEXT |
| `one` | `integer` (default), `bigint` | INTEGER | INTEGER, BIGINT |

Postgres only: `num({ type: "serial" })`, `timezone: true` on `timestamp` and `time`, and `date({ type: "interval", fields })` - for schema; its values do not yet round-trip.

Every connection validates on write: `varchar` and `char` length, integer ranges, `numeric` precision and scale.

```ts
import { Type, bool, num, str } from '@expressive/sql';

class Product extends Type {
  code = str({ type: "char", length: 3 });
  price = num({ type: "numeric", precision: 10, scale: 2 });
  listed = bool({ type: "text", either: ["yes", "no"] });
}
```

Add a datatype by augmenting the helper's `Types`:

```ts
import { StringColumn, Type, str } from '@expressive/postgres';

declare module '@expressive/orm' {
  namespace str {
    interface Inet extends StringColumn { type: "inet" }
    interface Types { inet: Inet }
  }
}

class Device extends Type {
  address = str({ type: "inet" });
}
```

## Drivers

A connection is a `Connection`, itself a Model. The floor every driver implements, keyed by table name and the class's primary column:

| Method | Does |
|---|---|
| `select(table, constraints, limit?, offset?)` | rows matching `[column, op, value]` tuples |
| `insert(table, data, returns?)` | inserts a row, returning it when asked |
| `update(table, id, data)` | updates one row |
| `remove(table, id)` | deletes one row |

Optional capabilities: `prepare(builder)` runs a `Query` - without it `Query` and `Type.query` throw; `subscribe(listener)` reports changes for live rows; `sync(fix?)` checks or creates the schema, and runs when the connection is awaited.

To write a driver, extend `Connection` from `@expressive/orm` and implement the floor - entities, relations, writes and the identity map work on that alone. For a SQL database extend `Connection` from `@expressive/sql`: it implements the floor over `Query`, leaving `prepare` (with a `Generator` subclass for the dialect) and `sync`.

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

`@expressive/sqlite` re-exports `@expressive/sql` and is removed in a later release. Install `@expressive/sql` and change the import:

```diff
- import { SQLiteConnection } from '@expressive/sqlite';
+ import { SQLiteConnection } from '@expressive/sql';
```

## License

ISC
