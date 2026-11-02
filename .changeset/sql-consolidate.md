---
"@expressive/sql": minor
---

`@expressive/sql` absorbs `@expressive/sqlite` and is a working embedded store on its own: `SQLiteConnection` picks a driver at runtime - `bun:sqlite`, `node:sqlite` (Node 24), then `better-sqlite3`, `sqlite3` or `@libsql/client`, the last three optional peers.

- `@expressive/orm` is a dependency, re-exported: import `Type`, `Query`, the field helpers and a connection from `@expressive/sql`. `@expressive/mvc` stays a peer.
- One SQL datatype vocabulary augments orm's helpers - `str`: `text`, `varchar`, `char`, `uuid`; `num`: `integer`, `smallint`, `bigint`, `real`, `float`, `double`, `numeric`, `decimal`; `bool`: `boolean`, `integer`, `text`, `varchar`; `date`: `timestamp`, `date`, `time`, `integer`, `text`; `one`: `integer`, `bigint`. `varchar`/`char` length, integer ranges and numeric precision and scale are validated on every dialect.
- The column classes export as `StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn` and `ForeignColumn`; importing only a connection narrows `type` options.
- SQLite renders each type as its affinity: `TEXT`, `INTEGER`, `REAL` or `NUMERIC` (`numeric` and `decimal` were `REAL`). A field's `datatype` is the declared type.
- `bool()` defaults to `boolean` and holds a JS boolean (bound as 1/0 on SQLite); `bool({ type: "integer" })` keeps 1/0. `num` and `date` no longer take `serial` or `datetime`.
- `SQLiteConnection` `sync` validates existing tables and creates only missing ones, so a database file reopens; `sync(false)` throws for a missing table.
