---
"@expressive/sql": minor
"@expressive/orm": patch
"@expressive/postgres": patch
---

SQLite stores a `timestamp` as INTEGER epoch milliseconds again, and the connection chooses: `SQLiteConnection.new(types, source, { timestamps })` takes `"ms"` (default), `"seconds"` or `"iso"` (ISO 8601 UTC text). `sql.now` in a `Query` or comparison, and a `fallback: sql.now` column default, render in the connection's storage, so `lessThan(sql.now)` and `date.created()` are right on an integer column. `sync`, `plan` and `expressive sql check` refuse a timestamp column declared the other way - INTEGER under `"iso"`, TEXT under `"ms"` - naming the option that keeps it, where before they reported plain type drift and `sync --force` would cast epoch numbers to unreadable text. `date` and `time` types stay text. Published packages now include `CHANGELOG.md`.

**Breaking:** a SQLite or D1 database created by 0.6 through 0.11 keeps timestamps as ISO text; `sync` now refuses it until you pass `{ timestamps: "iso" }` or migrate the columns.
