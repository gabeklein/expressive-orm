---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**Datatypes as modifiers.** `sql.*` names a column's datatype, with factories for sized ones: `num(sql.bigint, null)`, `str(sql.varchar(120), unique)`, `num(sql.decimal(10, 2))`. A datatype of another helper, like `num(sql.text)`, is a type error. `@expressive/postgres` adds `sql.serial`, `sql.timestamptz`, `sql.timetz` and `sql.interval`. `unique` and `index` join `optional` as modifiers; `null` replaces `orNull`, which is deprecated.

**Indexes.** `index`, or `{ index: "name" }`, makes `sync` create a missing index, named `<table>_<column>` by default. On SQLite an existing single-column index on the column counts.

**`key()` declares any id.** `key()` is an incrementing integer, typed `number`; `key(sql.text, { column: "name" })` a string required on insert; `key(sql.uuid)` a string generated on insert as a UUIDv7 when absent. A non-integer numeric key does not increment. `uuid()` is deprecated for `key(sql.uuid)` or `str(sql.uuid)`.

**Epoch milliseconds.** `date(sql.millis)` stores a `Date` as epoch milliseconds - INTEGER on SQLite, BIGINT on Postgres.

**`Query` is a `Promise`.** It has `catch` and `finally`, so returning one from an async function typechecks.
