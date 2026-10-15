---
"@expressive/sql": minor
---

`@expressive/sql` is Expressive ORM on SQL: it depends on and re-exports `@expressive/orm`, holds the SQL datatype vocabulary and the SQL connection base, and absorbs `@expressive/sqlite`. Installed alone it is a working embedded store on Bun or Node 24. Import `Type`, `Query`, the field helpers and a connection from here.

**Moved and removed**

- `Table`, `Field`, `Query`, `Builder`, `Parameter`, `DataTable`, `Primary` and the `Str`, `Num`, `Bool`, `Time` and `One` columns are removed. Entities are `Type` subclasses with orm's `str`, `num`, `bool`, `date`, `uuid`, `json` and `one` helpers; `Query` comes from orm, re-exported here.
- `SQLiteConnection` moves in from `@expressive/sqlite`. Construct connections with `SQLiteConnection.new(types, filename?)`.
- `Connection.None` is removed; a query without a connection prints orm's intent dump.
- `@expressive/orm` is a dependency; `@expressive/mvc` is a peer.

**SQLite**

- The driver is picked at runtime: `bun:sqlite`, `node:sqlite` (Node 24), then `better-sqlite3`, `sqlite3` or `@libsql/client`, the last three optional peers.
- `sync` validates existing tables and creates only missing ones, so a database file reopens; `sync(false)` throws for a missing table. Awaiting the connection runs it.
- Schema renders `PRIMARY KEY` for any primary column, `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate`. Each type renders as its affinity - `TEXT`, `INTEGER`, `REAL` or `NUMERIC` (`numeric` and `decimal` were `REAL`) - while a field's `datatype` stays the declared type. `json` is `TEXT`.
- `date` stores ISO strings by default; `"NOW"` is no longer a value to `set`.
- `close()` destroys the connection and unbinds its classes.
- No live rows: neither `node:sqlite` nor `bun:sqlite` exposes an update hook.

**Datatypes.** One vocabulary augments orm's helpers and validates on every dialect - `varchar`/`char` length, integer ranges, numeric precision and scale:

- `str`: `text` (default), `varchar`, `char`, `uuid`
- `num`: `integer` (default), `smallint`, `bigint`, `real`, `float`, `double`, `numeric`, `decimal`
- `bool`: `boolean` (default, a JS boolean, bound as 1/0 on SQLite), `integer` (1/0), `text` and `varchar` with `either`
- `date`: `timestamp` (default), `date`, `time`, `integer` (unix seconds), `text`
- `one`: `integer` (default), `bigint`

`num` and `date` no longer take `serial` or `datetime`. The column classes export as `StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn` and `ForeignColumn`; importing only a connection narrows `type` options.

**Connection base.** `Connection` extends orm's: it implements the floor - `select`, `insert`, `update`, `remove` - as builder statements against the class registered for the table, values bound as parameters and the class's primary column matched, so a renamed key round-trips. A dialect supplies `prepare` through a `Generator` subclass, and `sync`. `Generator` renders orm's `Builder`: `null` comparisons as `IS NULL` / `IS NOT NULL`, an insert with a selection with `RETURNING`, `offset` as `OFFSET`.

**Packaging.** ESM only, built with tsdown.

Requires `@expressive/mvc` `^0.89.0`.
