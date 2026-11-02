---
"@expressive/sqlite": minor
---

`@expressive/sqlite` builds on `@expressive/orm`. Entities are `Type` subclasses and run on SQLite: `Type.find`, `one`, `insert`, `save`, `update`, `delete` and `Type.query` all execute against the database.

- Schema renders `PRIMARY KEY` for any primary column (the default `id` no longer adds `UNIQUE`), `DEFAULT` for every `fallback` with `"NOW"` as `CURRENT_TIMESTAMP`, and `one()`'s `onDelete` / `onUpdate`.
- `date` stores ISO strings by default; `set("NOW")` is no longer a value.
- `close()` unbinds the connection's types.
