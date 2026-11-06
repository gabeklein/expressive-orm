# @expressive/sql

## 0.5.0

### Minor Changes

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`23f442c`](https://github.com/gabeklein/expressive-orm/commit/23f442c449927b10c9fb9b240eaa5161e6a01672) **Datatypes as modifiers.** `sql.*` names a column's datatype, with factories for sized ones: `num(sql.bigint, null)`, `str(sql.varchar(120), unique)`, `num(sql.decimal(10, 2))`. A datatype of another helper, like `num(sql.text)`, is a type error. `@expressive/postgres` adds `sql.serial`, `sql.timestamptz`, `sql.timetz` and `sql.interval`. `unique` and `index` join `optional` as modifiers; `null` replaces `orNull`, which is deprecated.
  
  **Indexes.** `index`, or `{ index: "name" }`, makes `sync` create a missing index, named `<table>_<column>` by default. On SQLite an existing single-column index on the column counts.
  
  **`key()` declares any id.** `key()` is an incrementing integer, typed `number`; `key(sql.text, { column: "name" })` a string required on insert; `key(sql.uuid)` a string generated on insert as a UUIDv7 when absent. A non-integer numeric key does not increment. `uuid()` is deprecated for `key(sql.uuid)` or `str(sql.uuid)`.
  
  **Epoch dates.** `date(sql.ms)` stores a `Date` as epoch milliseconds - INTEGER on SQLite, BIGINT on Postgres; `date(sql.seconds)` names the existing epoch-seconds `integer` storage.
  
  **`Query` is a `Promise`.** It has `catch` and `finally`, so returning one from an async function typechecks.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`0149fbe`](https://github.com/gabeklein/expressive-orm/commit/0149fbefd67b74f87ac9599b6f9b9bde4935e434) **A relation's column is named after its property.** `author = one(User)` stores `author_id`, not `user_id`; relations named after their class keep their column. Two fields on one column throw when the class is first used. On a table still holding the old column, sync reports the relation instead of adding an empty one: add `{ column: "user_id" }` to keep it.

- [#16](https://github.com/gabeklein/expressive-orm/pull/16) [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449) `@expressive/sql` is Expressive ORM on SQL: it depends on and re-exports `@expressive/orm`, holds the SQL datatype vocabulary and the SQL connection base, and absorbs `@expressive/sqlite`. Installed alone it is a working embedded store on Bun or Node 24. Import `Type`, `Query`, the field helpers and a connection from here.
  
  **Moved and removed**
  
  - `Table`, `Field`, `Query`, `Builder`, `Parameter`, `DataTable`, `Primary` and the `Str`, `Num`, `Bool`, `Time` and `One` columns are removed. Entities are `Type` subclasses with orm's `str`, `num`, `bool`, `date`, `uuid`, `json` and `one` helpers; `Query` comes from orm, re-exported here.
  - `SQLiteConnection` moves in from `@expressive/sqlite`. Construct connections with `SQLiteConnection.new(types, filename?)`.
  - `Connection.None` is removed; a query without a connection prints orm's intent dump.
  - `@expressive/orm` is a dependency; `@expressive/mvc` is a peer.
  
  **SQLite**
  
  - The driver is picked at runtime: `bun:sqlite`, `node:sqlite` (Node 24), then `better-sqlite3`, `sqlite3` or `@libsql/client`, the last three optional peers.
  - `sync` validates existing tables, creates missing ones and adds missing columns with `ALTER TABLE ... ADD COLUMN`, so a database file reopens after a field is added. A column it cannot add - primary, `unique`, `NOT NULL` without a `fallback`, or defaulting to `"NOW"` - is reported with the reason and nothing changes. Type drift is reported, never altered; columns not on the class are ignored. `sync(false)` throws for a missing table or column. Awaiting the connection runs it.
  - Schema renders `PRIMARY KEY` for any primary column, `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate`. Each type renders as its affinity - `TEXT`, `INTEGER`, `REAL` or `NUMERIC` (`numeric` and `decimal` were `REAL`) - while a field's `datatype` stays the declared type. `json` is `TEXT`.
  - `date` stores ISO strings by default; `"NOW"` is no longer a value to `set`.
  - `close()` destroys the connection and unbinds its classes.
  - No live rows: neither `node:sqlite` nor `bun:sqlite` exposes an update hook. `Type.update(id, data)` still settles a loaded entity.
  - `insert` reads the stored row back through `RETURNING`, defaults included.
  
  **Datatypes.** One vocabulary augments orm's helpers and validates on every dialect - `varchar`/`char` length, integer ranges, numeric precision and scale:
  
  - `str`: `text` (default), `varchar`, `char`, `uuid`
  - `num`: `integer` (default), `smallint`, `bigint`, `real`, `float`, `double`, `numeric`, `decimal`
  - `bool`: `boolean` (default, a JS boolean, bound as 1/0 on SQLite), `integer` (1/0), `text` and `varchar` with `either`
  - `date`: `timestamp` (default), `date`, `time`, `integer` (unix seconds), `text`
  - `one`: `integer` (default), `bigint`
  
  `num` and `date` no longer take `serial` or `datetime`. The column classes export as `StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn` and `ForeignColumn`; importing only a connection narrows `type` options.
  
  **Connection base.** `Connection` extends orm's: it implements the floor - `select`, `insert`, `update`, `remove` - as builder statements against the class registered for the table (passed to `new` or bound by `Type.connection = db`), values bound as parameters and the class's primary column matched, so a renamed key round-trips. A dialect supplies `prepare` through a `Generator` subclass, and `sync`. `Generator` renders orm's `Builder`: `null` comparisons as `IS NULL` / `IS NOT NULL`, an insert with a selection with `RETURNING`, `offset` as `OFFSET`, an empty `isIn` as false and `notIn` as true.
  
  **Fixes**
  
  - Inline string literals quote by doubling `'`, with no backslash escapes. A value containing `\'` broke out of its string on SQLite and Postgres - an injection - and `'` was a syntax error.
  - `static schema` throws on SQLite and Postgres `sync`; only `memory()` honours it.
  - A failed SQLite statement reports the engine error when its SQL cannot be formatted.
  
  **Packaging.** ESM only, built with tsdown.
  
  Requires `@expressive/mvc` `^0.94.0`.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`b9d339f`](https://github.com/gabeklein/expressive-orm/commit/b9d339f65bfdaf9fc68d06e2d4d9b509c86600b8) **`expressive sql check | sync [--force] <entry>`.** A bin, shared by `@expressive/*` packages, that imports the module creating your connections with `sync` held back, then reports or applies what each connection's schema needs. `check` exits 1 when anything would change and marks drift `--force` can rebuild.
  
  **`plan(force?)`.** SQL connections return what `sync` would do - `{ steps, problems }`, each step with `action`, `reason` and `sql` - without doing it. `sync` applies the plan in one transaction, and verify-only `sync(false)` now also reports missing indexes. A table referencing one the same sync creates no longer fails as a missing referenced table.
  
  **`sync(true, true)` rebuilds drift.** A column whose type or nullability differs from its class is altered on Postgres and rebuilt with its table on SQLite, keeping columns the class doesn't declare, indexes and triggers, and casting values. It refuses while a row would not fit - a NULL under `NOT NULL`, or text that is not a number for a numeric column - or while any row references a missing one. `plan()` is abstract on `Connection`; a custom subclass implements it.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`3c9c7a2`](https://github.com/gabeklein/expressive-orm/commit/3c9c7a2737be328077bf4c8c34060b60fbf338ef) **Transactions.** `connection.transaction(fn)` runs `fn` in one database transaction, committing when it resolves and rolling back when it throws. Statements inside join it without a handle, through `AsyncLocalStorage` loaded on first use; a nested call joins the open transaction, so a caught nested failure commits with it. On SQLite and PGlite, other statements wait until it ends and transactions queue; `pg` runs each on its own pooled client, discarding a client whose `BEGIN`, `COMMIT` or `ROLLBACK` failed. A rollback restores instances changed inside, destroys entities created inside and keeps entities deleted inside; a commit destroys those. SQLite and Postgres support it. Where `AsyncLocalStorage` is missing it throws, and `memory()` has none.
  
  **Driver contract.** orm's `Connection` declares an optional `transaction(fn)`. `@expressive/sql`'s `Connection` implements it over a protected `transact(fn)`, which a driver provides, plus `lock()` and an `idle()` its statements await - a pooled driver overrides both.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`cdf383b`](https://github.com/gabeklein/expressive-orm/commit/cdf383be6f92e34b2b75b3764696855ba83c872f) **Upsert.** `Type.insert(data, { conflict })` writes `ON CONFLICT`. `"update"` overwrites the existing row with every column given, minus the target and `keep`, returns it and settles a loaded instance; `"ignore"` leaves it and resolves `undefined`. `on` names the target - a key or keys, the primary key by default. The memory driver matches.
  
  **Composite keys.** `id = key(() => [this.account, this.role])` keys an entity by the fields it lists, with no column of its own. `id` is a string - the parts as JSON - typed as a key of their tuple (`Type.Id<T>` takes either), so it compares by value. `get`, `one`, `update` and `delete` take the key or the tuple, the identity map holds it, a part change through `set` or `update` rekeys a loaded instance, and `sync` declares `PRIMARY KEY (...)` - existing tables included. Live rows report a composite id on Postgres and memory. `one()` cannot relate to a composite-keyed class.
  
  **Driver contract.** `insert(table, data, returns?, conflict?)` takes `Connection.Conflict` (`{ on, update? }` by column). `update` and `remove` take `Connection.Key`, which is a tuple for a composite key; `Change.id` likewise. `Field.parts` lists a composite key's fields.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`a5fe1d2`](https://github.com/gabeklein/expressive-orm/commit/a5fe1d2b7c60a8a5a4485924d6ac50e99719caee) **`sql.now`.** The current time, wherever a date goes: a column `fallback`, an insert or update value, a comparison. In `Query` it renders as the database's clock in the column's own storage - ISO text with milliseconds, epoch ms or seconds, `date`, `time`, `timestamptz`; statics resolve it from the app's clock so settled instances hold the exact value. `fallback: "NOW"` is a deprecated alias, and a new SQLite `timestamp` default is ISO text with milliseconds rather than `CURRENT_TIMESTAMP`'s `YYYY-MM-DD HH:MM:SS`, which reads as UTC.
  
  **`date.created()` and `date.updated()`.** Date columns defaulting to now; `created` is never overwritten after insert, `updated` is set to now on every update and upsert that doesn't give it. They are `date()` with `{ fixed: true }` and `{ update: sql.now }`, which any column takes. A fixed column is left out of update types and throws if given to `update()` or `set()`; `update` also takes a function, called once per write.
  
  **`conflict: "replace"`.** An upsert setting every column from the new row - an omitted one to its default or NULL - except the primary key, `date.created` columns and `keep`. An upsert's `update` values apply only on conflict; a new row gets its `fallback`.
  
  **Writes by query.** `update(where, data)` and `delete(where)` take a query object in place of an id and resolve the rows affected, settling into or destroying loaded instances; an empty query throws. `count(where?)` counts rows. `null` in a query object matches a missing value. In `Query`, `where(table).match({ ... })` adds an `equal` per key.
  
  **`json()`** reads unparseable text as `undefined` instead of throwing, and `isLike` matches a `json()` column's stored text.
  
  **`Key<P>`** is exported, and a composite `id` is typed `Key<[number, string]>` rather than `Optional<KeyOf<...>>`.
  
  **Fallbacks fill on insert.** An omitted column with a `fallback` is written with it by the orm, not left to a database `DEFAULT` - a table created before the fallback existed gets it too. A nullable column defaulting to now can now be added to an existing SQLite table.
  
  **SQLite enforces foreign keys** on every driver; `bun:sqlite` left them off.

### Patch Changes

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`338865e`](https://github.com/gabeklein/expressive-orm/commit/338865e3a62f411801517b02fc04b0c13832fc89) Fixes found adopting an existing SQLite database:
  
  - SQLite `sync` accepts a primary key column not declared `NOT NULL`, as tables created outside the library usually are.
  - A count `Query` (no selection) resolves the matching row count on SQLite and Postgres; it resolved 0 on SQLite and the affected rows on Postgres.
  - A table joined twice in one `Query`, such as two relations to the same class, is aliased instead of failing with an ambiguous column.
  - `insert({})` writes `DEFAULT VALUES`. An insert per joined row with no values throws a clear error.
- Updated dependencies [[`23f442c`](https://github.com/gabeklein/expressive-orm/commit/23f442c449927b10c9fb9b240eaa5161e6a01672), [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449), [`0149fbe`](https://github.com/gabeklein/expressive-orm/commit/0149fbefd67b74f87ac9599b6f9b9bde4935e434), [`338865e`](https://github.com/gabeklein/expressive-orm/commit/338865e3a62f411801517b02fc04b0c13832fc89), [`b9d339f`](https://github.com/gabeklein/expressive-orm/commit/b9d339f65bfdaf9fc68d06e2d4d9b509c86600b8), [`3c9c7a2`](https://github.com/gabeklein/expressive-orm/commit/3c9c7a2737be328077bf4c8c34060b60fbf338ef), [`cdf383b`](https://github.com/gabeklein/expressive-orm/commit/cdf383be6f92e34b2b75b3764696855ba83c872f), [`a5fe1d2`](https://github.com/gabeklein/expressive-orm/commit/a5fe1d2b7c60a8a5a4485924d6ac50e99719caee)]:
  - @expressive/orm@0.13.0

## 0.4.4

### Patch Changes

- allow uuid type for Primary

## 0.4.3

### Patch Changes

- fix: failed to build previous change

## 0.4.2

### Patch Changes

- 2acdeb2: primary and fields with defaults are now Optional

## 0.4.1

### Patch Changes

- b8b2195: fix: rebuild libraries

## 0.4.0

### Minor Changes

- 6f4c66b: Major upgrade: generic Fields

## 0.3.1

### Patch Changes

- 857a18c: Improved types for One

## 0.3.0

### Minor Changes

- aa94a15: Generic fields

## 0.2.1

### Patch Changes

- f5c7c31: Allow any number as Str length

## 0.2.0

### Minor Changes

- 9720a38: Multiple Updates

### Patch Changes

- 004ebe8: replaced bad test scripts

## 0.1.1

### Patch Changes

- cef396d: limit published files to "dist" in package.json
