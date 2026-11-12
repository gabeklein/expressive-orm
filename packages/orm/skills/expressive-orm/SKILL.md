---
name: expressive-orm
description: Expressive ORM core (@expressive/orm) - entities as @expressive/mvc Models extending Type, field helpers, keys, relations, references and the identity map, Query, transactions, live rows, the Memory driver and the driver contract. Use when defining entities, reading or writing rows, building a Query, observing entities, testing on Memory, or writing a driver.
---

# Expressive ORM

An entity is a class extending `Type`, which extends `@expressive/mvc` `Model`. Model behaviour (observation, context, lifecycle) is in `expressive-mvc`.

`@expressive/orm` has no SQL. Apps install `@expressive/sql` (SQLite, skill `expressive-sql`) or `@expressive/postgres` (skill `expressive-postgres`); each re-exports this package. Import everything from the one package installed. Install `@expressive/orm` directly only to write a driver or run without SQL.

```bash
npm install @expressive/sql @expressive/mvc
```

## Entities

```ts
import { Type, bool, date, index, json, num, str, unique } from '@expressive/sql';

class User extends Type {
  name = str(index);
  email = str(unique);
  age = num(null);
  admin = bool({ fallback: false });
  joined = date.created();
  edited = date.updated();
  prefs = json<{ theme: string }>(null);
  token = str(null, { column: "api_token" });
}
```

Helpers: `str()` string, `num()` number, `bool()` boolean, `date()` Date. Options, any order:

- `null` - nullable, value `T | undefined`.
- `optional` - may be left out of an insert, for a column the database fills.
- `unique`, `index` - `sync` creates a missing index `<table>_<column>`, or `{ index: "name" }`.
- `{ column }` - column name; default is the property in snake case.
- `{ fallback }` - column default, also optional on insert. `now` (`sql.now` in `@expressive/sql`) is the database's current time.
- A datatype - portable, declared by orm: `str` takes `text`, `varchar`/`char` with `length`, `uuid`; `num` takes `integer` (default), `smallint`, `bigint`, `real`, `double`, `decimal`/`numeric` with `precision` and `scale`; `date` takes `timestamp` (default), `date`, `time`, with `timezone` on `timestamp` and `time`; `bool` takes `boolean`. Write it as an object - `str({ type: "varchar", length: 255 })` - or with `@expressive/sql`'s `sql.*` shorthand. Any other is a type error.

The field checks each write itself, on every connection: a string within `length`, an integer within its type's range, a decimal within precision and scale, a boolean, a Date (or date string, or epoch ms). `Connection.new` throws when it can't store a field's datatype.

Every helper has `.and(...presets)` - the same helper with those options first: `const money = num.and({ type: "decimal", precision: 10, scale: 2 })`, then `price = money(null)`. Types follow every option, preset or given; a preset helper chains `.and` again, and `.base` is the helper it presets.

`json<T>()` holds a JSON value and takes one option - `json<T>(null)` or `json<T>({ column })`. SQL stores it as text; unparseable text reads `undefined`.

`date.created()` and `date.updated()` are presets of `date`. `date.created()` is written on insert only - upserts leave it, an update giving it fails to compile and throws. It is also the class's recency order; two on one class throw. `date.updated()` is set to now on every update and upsert that doesn't give it. Any column takes `fixed` and `update`; `update` also takes a function, called once per write. A `Query` assignment still writes a fixed column.

Table is the class name in snake case; `static table` overrides. `static schema` qualifies it on `Memory` - SQLite and Postgres connections reject it. `static subset = { role: "admin" }` scopes a subclass to part of a shared table (give it the parent's `table`): merged into inserts and every query filter. `get(id)` is scoped; `update(id)`, `delete(id)` and instance `set`/`delete` are not.

### Keys

Every entity has an incrementing integer `id`. `key` changes it:

```ts
class Account extends Type {
  id = key({ column: "account_id" });   // number, increments
}

class Image extends Type {
  id = key(sql.text, { column: "name" });   // string, required on insert
}

class Session extends Type {
  id = key(sql.uuid);   // UUIDv7 generated on insert when absent
}

class Membership extends Type {
  id = key(() => [this.account, this.role]);   // composite
  account = one(Account);
  role = str();
}
```

An integer `key` increments; another numeric type does not. `User.get(id)`, `User.update(id)` and relations follow the key's type. A composite key lists `this.<field>` reads only, runs lazily, has no column; `id` is the parts as a JSON string typed `Key<[number, string]>` (exported). `get`, `update`, `delete` take the key or the tuple. `id` matches or orders by its parts - other operators throw - and `one()` cannot relate to a composite-keyed class.

## Connect

`Connection.new(types, ...)` binds each class to a connection; awaiting it runs `sync` once when the driver has one. `await db.close()` releases it, unbinds its classes and destroys every entity loaded through it.

A class no connection binds joins the `Memory` created last, on first use, while it is open, and stays on it until it closes. Listing it in a later `new` then throws `Type User already has assigned connection.` A connection with `sync` - SQLite, Postgres - takes only the classes listed; an unlisted one rejects with `No database connection`.

`Memory` keeps rows in arrays. It runs the floor and `Query` (not raw SQL templates) and reports every write for live rows.

### Testing

One `Memory` for the suite, in a setup file; `clear()` between tests deletes every row, restarts ids and destroys loaded entities:

```ts
import { Memory } from '@expressive/orm';

export const db = Memory.new();   // every class used joins it

afterEach(() => db.clear());
```

Don't recreate it per test - classes stay on the connection they first joined.

### Persisted

`Memory.new(types, source)` loads tables on creation and saves each change - for small apps:

```ts
const db = Memory.new([User, Post], "data.json");
```

A string is a JSON file on Bun, Node 20.16+/22.3+ and Deno, an IndexedDB database in a browser; elsewhere pass a `Memory.Adapter`. Saves run a macrotask after the write - `await db.close()` before exit or the last write is lost; it throws if that save failed. One connection per store: two tabs or processes overwrite each other.

## Read and write

```ts
const gabe = await User.insert({ name: "Gabe", email: "gabe@example.com", age: 35 });

await User.one({ email: "gabe@example.com" }); // the entity; throws if not found
await User.one({ name: "Nobody" }, false);     // undefined if not found

await User.query({ name: [isLike("G%"), asc()], age: [greaterThan(17), lessThan(65)] }, 10, 0);

for await (const batch of User.query({ admin: true }, 100)) batch.length; // every match, 100 per select

await User.count({ admin: true });                  // no query counts the table
await User.update(gabe.id, { age: 36 });
await User.update({ admin: false }, { age: 0 });    // resolves rows changed
await User.delete({ age: lessThan(18) });           // resolves rows deleted; empty query throws
```

`query` and `insert` return plain rows - frozen, decoded by property, a relation as its id. `insert` returns the stored row with `id` and defaults. `query(where?, limit?, offset?)` needs only the driver's `select`, so it works on a forwarding connection; `query(callback)`, `count`, and `update` / `delete` by filter run as a `Query` and need `prepare`. `one(where?, expect?)` resolves the live entity, as `load(where, 1)` - it takes a filter only; use `get(id)` for an id. For a row by id, `query({ id })`.

Operators: `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `isLike`, `isIn`, `notIn`, `isNull`, `notNull`, `asc` / `desc`. A plain value is `equal`, `null` is `isNull`, an array applies each. `isLike` also matches a `json()` column's text.

Without a filter, `query()`, `load()` and `one()` take the newest first - by the class's `date.created()` column, else an incrementing `id`; with neither, `one()` throws asking for a filter. A filter with a condition drops that order; add `asc()` / `desc()`. A read with a `limit` is always totally ordered, ties broken by `id`. `undefined`, as a value or an operator's argument, drops its condition.

With a `limit`, `query` returns `Type.Results` - awaited, the first batch; `for await`, every match. Batches move by offset - don't delete what you iterate; re-read instead. There is no batched `load`; read ids by `query`, then `load({ id: isIn(ids) })`.

On `Memory`, `isLike` is case-sensitive (SQLite's is ASCII case-insensitive) and `notIn([])` skips rows without a value (SQL matches every row).

```ts
await User.insert(row, { conflict: "update" });                      // upsert on the primary key
await User.insert(row, { conflict: "update", on: "email", keep: ["joined"] });
await User.insert(row, { conflict: "replace" });                     // every column; omitted ones reset
await User.insert(row, { conflict: "ignore" });                      // undefined if the row exists
```

`"update"` writes every column given minus the target, `keep` and `date.created` columns; columns with an `update` value take it. `on` takes a key or an array.

### Instances

```ts
const ann = await User.new({ name: "Ann", email: "ann@example.com" });

await ann.set({ age: 28 });   // resolves the keys that changed
await ann.delete();
```

- An instance is read-only - assigning a field throws. Write with `await entity.set(patch)`: it writes, then settles stored values in, notifying once. `null` clears a nullable column. Other `set` forms are Model's.
- `Type.new(values)` returns the instance at once; columns suspend until the row lands. A failed insert destroys it and rejects awaits.
- `User.update(id, ...)` / `User.delete(id)` and query writes settle into or destroy loaded instances.
- `entity.columns` is its row in the shape `insert` takes, never loading; `entity.get()` is the full snapshot.
- A protected `onDelete()` runs before `entity.delete()` removes the row; a throw cancels it. The static `delete` skips it.

## References

```ts
const user = User.get(1);   // loaded entity, or a placeholder loading it

user.get(({ name }) => console.log(name));   // runs once the row lands
await user;                                  // the entity
```

```ts
const users = await User.load({ admin: true }, 20);   // entities, one select
```

`Type.load(where?, limit?, offset?)` - `query`'s filter and order, resolving entities. A loaded entity settles the fetched row and is returned itself; others join the identity map. Prefer it over `query` plus `get(id)` per row.

`Type.get(id)` is synchronous through the identity map. A placeholder's columns suspend (a read throws a promise; an effect or a React component waits). In a Model, `get(User, id)` or `this.get(User, id)` resolves the same way. `User.get()` with no id stays Model's context lookup.

## Relations

```ts
class Author extends Type {
  name = str();
  posts = rows(Post, "author");
}

class Post extends Type {
  title = str();
  author = one(Author);
  editor = one(Author, null, lazy);
}

const post = await author.posts.insert({ title: "Hello", editor: author });
await author.posts.query();
await author.posts.one({ title: "Hello" });
```

- `one(Other)` stores `<field>_id` and loads the related entity with its parent - with `lazy`, on first read, suspending. Related entities are shared references. A write takes an entity, an id, or an object - inserted as a new related row when it has no `id`. A filter takes the same; an object without `id` matches by its fields.
- `rows(Other, key?)` - `query`, `load`, `one`, `insert` with the foreign key applied. `key` only when `Other` relates to this class more than once.

## Observe

Entities are Models - observe them as in `expressive-mvc`. Await a lazy relation through `get`:

```ts
const editor = await post.get(async ($) => $.editor);
```

## Errors

| Message | Cause |
|---|---|
| `User.name is read-only; use set().` | assigned a field |
| `User is not loaded yet.` | `set` or `delete` on a reference before its row lands |
| `User 1 was deleted.` | `set` or `delete` after the row went |
| `Missing required field: name` | insert without a required column |
| `created is fixed and can't be updated.` | an update gave a fixed column |
| `User needs a condition to write by query.` | `update({}, …)` or `delete({})` |
| `No database connection. …` | class not listed on a SQL connection, no `Memory` open when first used, or its connection closed |
| `Type User already has assigned connection.` | listed in `new` after it joined or was bound elsewhere |

## Query

`where(Class)` adds a table and returns its columns; `where(column)` a condition; the return value is the selection.

```ts
import { Query } from '@expressive/sql';

const titles = await Query(where => {
  const post = where(Post);

  where(post.author.name).equal("Gabe");
  where(post.title).asc();
  where(10);   // limit

  return { title: post.title, by: post.author.name };
});

await Query(where => {
  const user = where(User);
  where(user.age).over(30);
  where(user).update({ admin: true });   // or .delete()
});

await Query(where => { where(User, { name: "Cam", email: "cam@example.com" }) });   // insert

const byName = Query(where => (name: string) => {   // template, built once
  const user = where(User);
  where(user.name).equal(name);
  return user;
});

const admins = User.query((user, where) => { where(user.admin).equal(true) });
```

- Return a column for its values, an object for rows of that shape, a table for its rows - frozen.
- `where(a, b)` groups conditions with `or`; a group inside a group alternates to `and`.
- Comparisons - `equal`, `not`, `over`, `under` (`true` for or-equal), `in`. `where(table).match({ ... })` adds an `equal` per key.
- A `one()` relation joins on access - inner when required, left when nullable. `where(Other)` adds a table and needs a condition against another table's column - `where(other.email).equal(user.email)` - else on SQL the query throws `Table other has no joins.` `where(Other, true)` left joins.
- `where(Class, a, b)` inserts several rows. `where(rows)` uses an array of objects as a table, to join against or insert from - add it after the entity tables.
- A template's arguments are placeholders - compare with them, don't branch on them.
- `query.one()` resolves the first row, `query.one(true)` throws without one.
- A write resolves the rows affected. A query returning nothing and writing nothing resolves the count. A query runs when awaited, once per `then`.
- A second callback argument holds math (`add`, `sub`, `mul`, `div`, `mod`, `neg`, `pos`) and `bit`; a template string embeds raw SQL (not on `Memory`).
- `String(query)` is the SQL, or the query's intent without one.

## Transactions

```ts
const ann = await db.transaction(async () => {
  const ann = await User.insert({ name: "Ann", email: "ann@example.com" });
  await User.update(gabe.id, { admin: true });
  return ann;
});
```

Commits when `fn` resolves, rolls back and rethrows when it throws. Every statement inside - statics, `Query`, instance writes, effects they trigger - joins without a handle. A nested `transaction` joins the open one. Rollback restores what instances changed, destroys entities created inside, keeps entities deleted inside. Other statements on the connection wait until it ends, except on a pooled driver. Needs `AsyncLocalStorage` from `process.getBuiltinModule` (Bun, Node 20.16+/22.3+, Deno, Workers with `nodejs_compat`); throws without it - in a browser and on React Native.

## Hooks

```ts
db.before(Upload, { delete(row){ if (row.locked) throw new Error("locked") } });   // a gate; returns a remover
db.after(Upload, { async delete(row){ await bucket.delete(row.path) } });         // best effort; returns a remover
```

They run host-side for deletes by id - instance `delete()`, static `delete(id)`, or `remove(table, id)` from a remote client - so prefer them over `onDelete` for rules that must hold wherever a delete was called. A delete by filter, a `Query` delete or a cascade skips both. `before` throwing cancels the delete; `after` throwing only logs. In a `transaction`, `after` runs after commit, never on rollback.

## Live rows

A connection with `subscribe` keeps loaded entities current with changes made elsewhere: an update settles in, a delete destroys, an insert changes nothing loaded. `Memory` reports every write; Postgres uses LISTEN/NOTIFY; SQLite has none.

## Drivers

`Connection` (an abstract Model) - the floor is `select`, `insert`, `update` and `remove`, keyed by table name and primary column; each is documented on `Connection`. It takes and returns plain values - Dates, booleans, JSON values, and a `date({ type: "date" })` calendar day as the text `YYYY-MM-DD` - so a client connection can forward the four calls to a server's as they are, whatever either side's time zone. A composite `id` arrives as its tuple, in `key` order.

A driver storing values its own way sets a protected `codecs` getter - a map from base helper (`str`, `num`, `bool`, `date`, `json`) to a `Connection.Codec`. A relation resolves by its referenced key. Without `codecs`, values pass through as they are, as on `Memory`. Optional: `prepare(builder)` runs `Query` (without it `Query` and `Type.query` throw); `subscribe(listener)` reports `{ table, op, id, row? }` and returns a stop function; `sync(fix?)` checks or creates the schema; protected `transact(fn)` enables `transaction(fn)`. `Connection` holds the lock and journal: call `idle()` before each statement; a pooled driver overrides `lock()` and `idle()`.

For a SQL database extend `@expressive/sql`'s `Connection` instead (see `expressive-sql`). Without a query language, `evaluate(store, builder, params)` runs `Query` in JS against an `evaluate.Store`, returning `{ rows, count }`.

Driver seams import from `@expressive/orm/driver` - `Builder`, `evaluate`, `Where`, and the values a SQL generator renders (`Computed`, `DataField`, `DataTable`, `Parameter`, `QueryTemplate`). App code never needs them.

```ts
class Logged extends Connection {
  inner = Memory.new();

  select(...args: Parameters<Connection["select"]>) {
    console.log("select", args[0]);
    return this.inner.select(...args);
  }
  // insert, update and remove forward the same way
}
```
