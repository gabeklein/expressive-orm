---
"@expressive/sqlite": minor
---

`@expressive/sqlite` builds on `@expressive/orm`, which it now peers (with `@expressive/mvc`). Entities are `Type` subclasses and run on SQLite: `Type.find`, `one`, `insert`, `save`, `update`, `delete` and `Type.query` all execute against the database.

- The package exports `SQLiteConnection` only; it no longer re-exports `@expressive/sql`. Import `Type`, `Query` and the field helpers from `@expressive/orm`.
- Datatypes augment orm's helpers: `str` (`text`), `num` (`integer`, `real` and their synonyms), `bool` (`integer`, `text` with `either`), `date` (`timestamp`, `datetime`, `date`, `time`, `integer`, `text`) and `one` (`integer`).
- Schema renders `PRIMARY KEY` for any primary column (the default `id` no longer adds `UNIQUE`), `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate`.
- `date` stores ISO strings by default; `set("NOW")` is no longer a value.
- `close()` unbinds the connection's types.
