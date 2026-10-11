---
"@expressive/postgres": minor
---

`@expressive/postgres` builds on `@expressive/orm`. Entities are `Type` subclasses and run on Postgres and PGLite: `Type.find`, `one`, `insert`, `save`, `update`, `delete` and `Type.query` all execute against the database.

- `bool` binds JS booleans to `boolean` columns. A `timestamp` without `timezone` stores and reads UTC wall time.
- Schema renders `PRIMARY KEY` for any primary column (the default `id` no longer adds `UNIQUE`), `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate` on the foreign key.
- `RETURNING` moved to `@expressive/sql`'s generator; a query without a connection prints orm's intent dump instead of SQL.
