# @expressive/postgres

## 0.7.1

### Patch Changes

- Updated dependencies [[`da081bd`](https://github.com/gabeklein/expressive-orm/commit/da081bd0ed401965f6ec097099034022adb6e215)]:
  - @expressive/orm@0.16.0
  - @expressive/sql@0.8.2

## 0.7.0

### Minor Changes

- [#51](https://github.com/gabeklein/expressive-orm/pull/51) [`8905fb4`](https://github.com/gabeklein/expressive-orm/commit/8905fb4a3553437e2ac3d7c3e33e564c7a46cd55) Fields declare portable datatypes and connections own storage. A field checks plain values the same on every side - integer ranges, decimal precision and scale, string length - and a connection takes and returns them, Dates and JSON values included, storing them through codecs chosen by the field's base helper (`Connection.Codec`, a protected `codecs` getter). One schema module importing only `@expressive/orm` binds to SQLite, D1, Postgres, `memory()` or a connection forwarding to a server, and the SQL floor checks forwarded values again before storing them. `Connection.new` throws for a field the connection can't store.
  
  Breaking: orm declares the portable types - `str` text, varchar, char, uuid; `num` integer (now the default everywhere), smallint, bigint, real, double, decimal, numeric; `date` timestamp, date, time, with `timezone`; `bool` boolean. Storage-only types are dropped - `date` ms, seconds, integer and text, `num` float, `bool` with `either`, `one` integer and bigint (a relation takes its key's type), Postgres `serial` and `interval` - with their `sql.*` tokens. The column classes and `X.Type` hooks are gone (`StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn`); `@expressive/sql` exports `codecs` instead. `Field.datatype` is gone. `memory()` stores values as given.
  
  Every helper gains `.and(...presets)`, returning the same helper with those options first; `date.created` and `date.updated` are presets of `date`.
  
  A `date({ type: "date" })` column is a calendar day, not an instant: a Date gives its local day, a `"YYYY-MM-DD"` string is that day, and it reads as local midnight. It crosses every connection and is stored as `YYYY-MM-DD`, so a client and server in different time zones agree.

- [#50](https://github.com/gabeklein/expressive-orm/pull/50) [`f5cafff`](https://github.com/gabeklein/expressive-orm/commit/f5cafff8d048e390a48dd6c67315ccdc2496e464) `Type.load(where?, limit?, offset?)` resolves live entities for a filter in one select, reusing and settling loaded ones; `rows()` handles gain `load`. `connection.before(Type, { delete(row) })` gates a delete by id - a throw cancels it - and `connection.after(Type, { delete(row) })` runs best-effort effects once it is done: awaited, errors logged rather than thrown, after commit inside a transaction. Each returns a remover.

### Patch Changes

- Updated dependencies [[`8905fb4`](https://github.com/gabeklein/expressive-orm/commit/8905fb4a3553437e2ac3d7c3e33e564c7a46cd55), [`f5cafff`](https://github.com/gabeklein/expressive-orm/commit/f5cafff8d048e390a48dd6c67315ccdc2496e464)]:
  - @expressive/orm@0.15.0
  - @expressive/sql@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`7024b85`](https://github.com/gabeklein/expressive-orm/commit/7024b85d4386b1aad9f238543926d1b1dd5980d9)]:
  - @expressive/sql@0.7.0

## 0.6.0

### Minor Changes

- [#47](https://github.com/gabeklein/expressive-orm/pull/47) [`9cf9cde`](https://github.com/gabeklein/expressive-orm/commit/9cf9cde5a0b5e74c8f514e44ee68a88d7cb63f03) Driver seams move to `@expressive/orm/driver`: `Builder`, `Where`, `Computed`, `DataField`, `DataTable`, `Parameter` and `QueryTemplate`. The root entry - and `@expressive/sql`'s, which re-exports it - keeps the app API. `Where` stays on the root as a type. A driver imports these, and `evaluate`, from `@expressive/orm/driver`.

### Patch Changes

- [#40](https://github.com/gabeklein/expressive-orm/pull/40) [`1d1dbb5`](https://github.com/gabeklein/expressive-orm/commit/1d1dbb55f3b0cccb2049d41035aa31f7772ed65e) **`Generator` exposes protected hooks for dialects.** `literal(value)` renders every literal in values, `SET` and `WHERE`; `insertWith(cte, into, select)` places a data CTE in an insert; `table(table)` renders a table with its alias for `FROM`, joins, `UPDATE` and `DELETE`. A schema-qualified table's alias is now quoted everywhere, fixing Postgres queries and updates that aliased one.

- [#44](https://github.com/gabeklein/expressive-orm/pull/44) [`567a398`](https://github.com/gabeklein/expressive-orm/commit/567a3982aeea543aeadec8d9529b836187671330) Ship each package's agent skill in the package, at `skills/expressive-<pkg>/SKILL.md`, so the docs an agent reads match the installed version. Agents read them from `node_modules/@expressive/<pkg>/skills/` - point one there with a line in `AGENTS.md`, or `npx skills add gabeklein/expressive`.
- Updated dependencies [[`7603ed0`](https://github.com/gabeklein/expressive-orm/commit/7603ed0b12d4305c34adc1cca5b0126dcdde01ee), [`1d1dbb5`](https://github.com/gabeklein/expressive-orm/commit/1d1dbb55f3b0cccb2049d41035aa31f7772ed65e), [`acd61f1`](https://github.com/gabeklein/expressive-orm/commit/acd61f112e38d330fe7c990e974bf6595a59699a), [`9cf9cde`](https://github.com/gabeklein/expressive-orm/commit/9cf9cde5a0b5e74c8f514e44ee68a88d7cb63f03), [`4f3e23c`](https://github.com/gabeklein/expressive-orm/commit/4f3e23c9e75cd4f9dc65e7ebda02577829e4d0d1), [`567a398`](https://github.com/gabeklein/expressive-orm/commit/567a3982aeea543aeadec8d9529b836187671330), [`acd61f1`](https://github.com/gabeklein/expressive-orm/commit/acd61f112e38d330fe7c990e974bf6595a59699a), [`0c5d036`](https://github.com/gabeklein/expressive-orm/commit/0c5d03630311ccbcbfa29515537577ad509ecaac), [`7603ed0`](https://github.com/gabeklein/expressive-orm/commit/7603ed0b12d4305c34adc1cca5b0126dcdde01ee)]:
  - @expressive/orm@0.14.0
  - @expressive/sql@0.6.0

## 0.5.0

### Minor Changes

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`23f442c`](https://github.com/gabeklein/expressive-orm/commit/23f442c449927b10c9fb9b240eaa5161e6a01672) **Datatypes as modifiers.** `sql.*` names a column's datatype, with factories for sized ones: `num(sql.bigint, null)`, `str(sql.varchar(120), unique)`, `num(sql.decimal(10, 2))`. A datatype of another helper, like `num(sql.text)`, is a type error. `@expressive/postgres` adds `sql.serial`, `sql.timestamptz`, `sql.timetz` and `sql.interval`. `unique` and `index` join `optional` as modifiers; `null` replaces `orNull`, which is deprecated.
  
  **Indexes.** `index`, or `{ index: "name" }`, makes `sync` create a missing index, named `<table>_<column>` by default. On SQLite an existing single-column index on the column counts.
  
  **`key()` declares any id.** `key()` is an incrementing integer, typed `number`; `key(sql.text, { column: "name" })` a string required on insert; `key(sql.uuid)` a string generated on insert as a UUIDv7 when absent. A non-integer numeric key does not increment. `uuid()` is deprecated for `key(sql.uuid)` or `str(sql.uuid)`.
  
  **Epoch dates.** `date(sql.ms)` stores a `Date` as epoch milliseconds - INTEGER on SQLite, BIGINT on Postgres; `date(sql.seconds)` names the existing epoch-seconds `integer` storage.
  
  **`Query` is a `Promise`.** It has `catch` and `finally`, so returning one from an async function typechecks.

- [#16](https://github.com/gabeklein/expressive-orm/pull/16) [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449) `@expressive/postgres` runs Expressive ORM entities on Postgres and PGLite, and keeps loaded entities live as rows change. It depends on and re-exports `@expressive/sql`: import `Type`, `Query`, the field helpers and `PGConnection` or `PGLiteConnection` from here.
  
  **Connections**
  
  - `PGConnection.new(types, config)` - a connection string, `pg` `PoolConfig` or `Pool`. `PGLiteConnection.new(types, dataDir | pglite, options)`.
  - Awaiting a connection runs `sync`: verify existing tables, create missing ones, add missing columns with their foreign keys, install triggers. `PGConnection` creates them too. A column it cannot add - primary, `NOT NULL` without a `fallback`, `unique` with a `fallback` - is reported with the reason and nothing changes; a missing `optional` one is left absent. Type drift is reported, never altered; columns not on the class are ignored. `sync(false)` throws for a missing column too.
  - Reopening verifies parameterized and aliased types - `varchar(n)`, `char(n)`, `numeric(p,s)`, `timestamp (p)`, `serial`, `float`, `double` - ignoring length and precision.
  - `close()` ends a `Pool` or `PGlite` only when the connection created it.
  - `Type.find`, `one`, `insert`, `new`, `update`, `delete`, an entity's `set` and `Type.query` execute against the database; `insert` reads the stored row back through `RETURNING`, generated `id` and defaults included.
  - `@expressive/orm` and `@expressive/sql` are dependencies; `@expressive/mvc` is a peer; `pg` and `@electric-sql/pglite` (`>=0.2.16`) are optional peers.
  
  **Live rows** over LISTEN/NOTIFY. `sync` installs an `expressive_notify()` trigger function and a trigger per table, which `pg_notify` the `expressive_orm` channel with `{ table, op, id, row }` - `row` omitted past 8000 bytes, and reloaded. Other payloads on the channel are ignored. `PGConnection` listens on a client of its pool, `PGLiteConnection` through PGLite's `listen`, from the first entity loaded until the connection is closed. Entities loaded through either follow changes made by any client. Requires Postgres 14+ (`CREATE OR REPLACE TRIGGER`); a pooler in transaction mode drops notifications.
  
  **Datatypes** come from sql's shared vocabulary, so a column config moves between SQLite and Postgres unchanged. Postgres adds `num` `serial`, `date` `interval` with `fields` (schema only for now), and `timezone` on `timestamp` and `time`. `TimeColumn` exports postgres's subclass.
  
  **Behaviour**
  
  - An incrementing `id` renders `GENERATED BY DEFAULT AS IDENTITY`, so an explicit id inserts; the sequence does not advance past it.
  - Schema renders `PRIMARY KEY` for any primary column (the default `id` no longer adds `UNIQUE`), `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate` on the foreign key. `json` is `TEXT`.
  - `bool` binds JS booleans to `boolean` columns. A `timestamp` without `timezone` stores and reads UTC with milliseconds, as a `Date` or a string. A `time` with `timezone` reads as a `Date`.
  - `RETURNING` renders through sql's generator; a query without a connection prints orm's intent dump.
  
  **Packaging.** ESM only, built with tsdown.
  
  Requires `@expressive/mvc` `^0.94.0`.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`0149fbe`](https://github.com/gabeklein/expressive-orm/commit/0149fbefd67b74f87ac9599b6f9b9bde4935e434) **A relation's column is named after its property.** `author = one(User)` stores `author_id`, not `user_id`; relations named after their class keep their column. Two fields on one column throw when the class is first used. On a table still holding the old column, sync reports the relation instead of adding an empty one: add `{ column: "user_id" }` to keep it.

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
- Updated dependencies [[`23f442c`](https://github.com/gabeklein/expressive-orm/commit/23f442c449927b10c9fb9b240eaa5161e6a01672), [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449), [`0149fbe`](https://github.com/gabeklein/expressive-orm/commit/0149fbefd67b74f87ac9599b6f9b9bde4935e434), [`338865e`](https://github.com/gabeklein/expressive-orm/commit/338865e3a62f411801517b02fc04b0c13832fc89), [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449), [`b9d339f`](https://github.com/gabeklein/expressive-orm/commit/b9d339f65bfdaf9fc68d06e2d4d9b509c86600b8), [`3c9c7a2`](https://github.com/gabeklein/expressive-orm/commit/3c9c7a2737be328077bf4c8c34060b60fbf338ef), [`cdf383b`](https://github.com/gabeklein/expressive-orm/commit/cdf383be6f92e34b2b75b3764696855ba83c872f), [`a5fe1d2`](https://github.com/gabeklein/expressive-orm/commit/a5fe1d2b7c60a8a5a4485924d6ac50e99719caee)]:
  - @expressive/orm@0.13.0
  - @expressive/sql@0.5.0

## 0.4.7

### Patch Changes

- fix: failed to build previous change
- Updated dependencies
  - @expressive/sql@0.4.3

## 0.4.6

### Patch Changes

- 2acdeb2: primary and fields with defaults are now Optional
- Updated dependencies [2acdeb2]
  - @expressive/sql@0.4.2

## 0.4.5

### Patch Changes

- fix schema verification

## 0.4.4

### Patch Changes

- Fix pg init

## 0.4.3

### Patch Changes

- fix bad loader for pg

## 0.4.2

### Patch Changes

- Dynamic import for adapter engines

## 0.4.1

### Patch Changes

- b8b2195: fix: rebuild libraries
- Updated dependencies [b8b2195]
  - @expressive/sql@0.4.1

## 0.4.0

### Minor Changes

- 6f4c66b: Major upgrade: generic Fields

### Patch Changes

- Updated dependencies [6f4c66b]
  - @expressive/sql@0.4.0

## 0.3.0

### Minor Changes

- aa94a15: Generic fields

### Patch Changes

- Updated dependencies [aa94a15]
  - @expressive/sql@0.3.0

## 0.2.2

### Patch Changes

- 3db0a08: bump @expressive/sql

## 0.2.1

### Patch Changes

- expose PGConnection

## 0.2.0

### Minor Changes

- 9720a38: Multiple Updates

### Patch Changes

- 004ebe8: replaced bad test scripts
- Updated dependencies [9720a38]
- Updated dependencies [004ebe8]
  - @expressive/sql@0.2.0

## 0.1.1

### Patch Changes

- cef396d: limit published files to "dist" in package.json
- Updated dependencies [cef396d]
  - @expressive/sql@0.1.1
