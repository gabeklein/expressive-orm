---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**`sql.now`.** The current time, wherever a date goes: a column `fallback`, an insert or update value, a comparison. In `Query` it renders as the database's clock in the column's own storage - ISO text with milliseconds, epoch ms or seconds, `date`, `time`, `timestamptz`; statics resolve it from the app's clock so settled instances hold the exact value. `fallback: "NOW"` is a deprecated alias, and a new SQLite `timestamp` default is ISO text with milliseconds rather than `CURRENT_TIMESTAMP`'s `YYYY-MM-DD HH:MM:SS`, which reads as UTC.

**`date.created()` and `date.updated()`.** Date columns defaulting to now; `created` is never overwritten after insert, `updated` is set to now on every update and upsert that doesn't give it. They are `date()` with `{ fixed: true }` and `{ touch: sql.now }`, which any column takes.

**`conflict: "replace"`.** An upsert setting every column from the new row - an omitted one to its default or NULL - except `date.created` columns and `keep`.

**Writes by query.** `update(where, data)` and `delete(where)` take a query object in place of an id and resolve the rows affected, settling into or destroying loaded instances; an empty query throws. `count(where?)` counts rows. In `Query`, `where(table).match({ ... })` adds an `equal` per key.

**`json()`** reads unparseable text as `undefined` instead of throwing, and `isLike` matches a `json()` column's stored text.

**`Key<P>`** is exported, and a composite `id` is typed `Key<[number, string]>` rather than `Optional<KeyOf<...>>`.

**Fallbacks fill on insert.** An omitted column with a `fallback` is written with it by the orm, not left to a database `DEFAULT` - a table created before the fallback existed gets it too.
