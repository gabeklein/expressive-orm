---
"@expressive/postgres": minor
---

`@expressive/postgres` builds on `@expressive/orm`, which it now peers (with `@expressive/mvc`). Entities are `Type` subclasses and run on Postgres and PGLite: `Type.find`, `one`, `insert`, `save`, `update`, `delete` and `Type.query` all execute against the database.

- The package exports `PGConnection` and `PGLiteConnection` only; it no longer re-exports `@expressive/sql`. Import `Type`, `Query` and the field helpers from `@expressive/orm`.
- Datatypes augment orm's helpers: `str` (`text`, `varchar`, `char`, `uuid`, with `collate`), `num` (`integer`, `smallint`, `bigint`, `real`, `double`, `numeric`, `serial`) with range checks, `bool` (`boolean`, `varchar` with `either`), `date` (`timestamp`, `date`, `time`, `interval`, with `precision` and `timezone`) and `one` (`integer`, `bigint`).
- `bool` binds JS booleans to `boolean` columns. A `timestamp` without `timezone` stores and reads UTC wall time.
- Schema renders `PRIMARY KEY` for any primary column (the default `id` no longer adds `UNIQUE`), `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate` on the foreign key.
- `RETURNING` moved to `@expressive/sql`'s generator; a query without a connection prints orm's intent dump instead of SQL.
